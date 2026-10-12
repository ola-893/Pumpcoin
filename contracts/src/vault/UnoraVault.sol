// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VaultValuationSource} from "./VaultValuationSource.sol";
import {RestrictedSpotAdapter} from "./RestrictedSpotAdapter.sol";
import {ServiceExpenseStream} from "./ServiceExpenseStream.sol";

interface IIdentityRegistry {
    function ownerOf(uint256 agentId) external view returns (address);
}

/// @notice Unora agent-managed investment vault (vertical slice, test tokens only).
/// @dev One agent, one vault, one quote/accounting asset, one spot venue,
/// allowlisted assets, restricted adapter, explicit expense budget, no leverage,
/// no performance fees. Investors own shares; the agent is the manager;
/// returns are distributions/redemptions, not loan repayment.
/// NAV (policy UNORA-VAULT-NAV-v1.0.0):
///   NAV = quoteBalance(vault) + markedAssetValue + accountedRefundableEscrow - accruedExpenses (floor 0)
/// The view may disclose floored zero equity, but ordinary share issuance is gated
/// on solvency (see Insolvent): new capital must not silently cover old deficits.
/// Share conversions use OZ ERC4626 virtual-share math (offset 6) + min-first-deposit
/// + zero-share rejection + exact-transfer (fee/rebase defense). This contract is
/// ERC-4626-DERIVED, not conformant: conversions/previews/totalAssets revert on
/// stale/unreliable valuation by design (OWN-04) instead of returning a price.
/// Venue, stream, caps, budget, strategy/risk and identity bindings are ALL effective
/// configuration: they change only through the timelocked propose/apply procedure
/// (MAN-05), except immediate manager revocation and adapter revocation which are
/// documented safety actions. Period boundaries never encode unknown NAV as zero:
/// unvalued boundaries carry valued=false, a reason and balance checkpoints.
contract UnoraVault is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant NAV_POLICY_VERSION = "UNORA-VAULT-NAV-v1.0.0";
    bytes32 public immutable navPolicyHash;
    uint256 public constant CONFIG_DELAY = 1 days;

    IERC20 public immutable positionAsset;
    VaultValuationSource public valuationSource;
    RestrictedSpotAdapter public adapter;
    ServiceExpenseStream public expenseStream;

    address public admin;
    address public manager;
    uint256 public managerVersion;
    bytes32 public strategyHash;
    bytes32 public riskHash;
    address public identityRegistry;
    uint256 public agentId;

    uint256 public perTradeCap; // max QUOTE-notional per trade, both directions (6-decimal base units)
    uint256 public maxPositionValue;
    uint256 public expenseBudget;
    uint256 public minFirstDeposit;

    uint256 public accruedExpenses;
    uint256 public totalFunded;
    uint256 public totalSettled;
    bool public paused;

    uint256 public periodId;

    struct Period {
        uint64 startBlock;
        uint64 startTime;
        uint64 endBlock;
        uint64 endTime;
        uint256 startNAV;
        uint256 endNAV;
        bool startValued;
        bool endValued;
        bytes32 startReason;
        bytes32 endReason;
        uint256 startCash;
        uint256 startPositions;
        uint256 startEscrow;
        uint256 startAccrued;
        uint256 endCash;
        uint256 endPositions;
        uint256 endEscrow;
        uint256 endAccrued;
        bytes32 configHash;
        bytes32 strategyHash;
        bytes32 riskHash;
        address manager;
        address identityRegistry;
        uint256 agentId;
        bool closed;
    }
    mapping(uint256 => Period) public periods;

    struct ConfigArgs {
        address adapter;
        address venue;
        address stream;
        address valuationSource;
        uint256 perTradeCap;
        uint256 maxPositionValue;
        uint256 expenseBudget;
        bytes32 strategyHash;
        bytes32 riskHash;
        address identityRegistry;
        uint256 agentId;
    }

    struct PendingConfig {
        ConfigArgs args;
        uint64 effectiveAt;
        bool exists;
    }
    PendingConfig public pending;

    error NotAdmin();
    error NotManager();
    error Paused();
    error ValuationUnavailable(bytes32 reason);
    error Insolvent();
    error ZeroShares();
    error FirstDepositTooSmall();
    error UnsupportedTokenTransfer();
    error InsufficientQuoteLiquidity();
    error ExceedsPerTradeCap();
    error ExceedsExposure();
    error ExceedsExpenseBudget();
    error NoPendingConfig();
    error ConfigNotReady();
    error DanglingEscrow();
    error BadAddress();
    error BadBinding();
    error StrategyChangeRequiresNotice();

    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event ManagerRotated(address indexed oldManager, address indexed newManager, uint256 version);
    event PeriodOpened(
        uint256 indexed periodId, bytes32 configHash, bytes32 strategyHash, address manager, bool valued
    );
    event PeriodClosed(uint256 indexed periodId, uint256 endNAV, bool valued);
    event ConfigProposed(bytes32 configHash, uint64 effectiveAt);
    event ConfigApplied(uint256 indexed periodId, bytes32 configHash);
    event AdapterUpdated(address indexed adapter);
    event VenueUpdated(address indexed venue);
    event ValuationSourceUpdated(address indexed source);
    event ExpenseStreamUpdated(address indexed stream);
    event IdentityBound(address indexed registry, uint256 indexed agentId);
    event PausedVault(address indexed by);
    event UnpausedVault(address indexed by);
    event ManagerTrade(
        address indexed venue, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut
    );
    event ExpenseFunded(bytes32 indexed obligationId, uint256 amount, bytes32 serviceId, address recipient);
    event ExpenseAccrued(uint256 amount, uint256 totalAccrued);
    event ExpenseAccrualReversed(uint256 amount, uint256 totalAccrued);
    event ExpenseSettled(bytes32 indexed obligationId, uint256 amount);
    event ExpenseRefunded(bytes32 indexed obligationId, uint256 amount);

    constructor(
        IERC20 quote_,
        IERC20 asset_,
        VaultValuationSource source_,
        address admin_,
        address manager_,
        bytes32 strategyHash_,
        bytes32 riskHash_,
        uint256 perTradeCap_,
        uint256 maxPositionValue_,
        uint256 expenseBudget_,
        uint256 minFirstDeposit_,
        bytes32 policyHash_
    ) ERC4626(quote_) ERC20("Pump token", "PUMP") {
        require(
            address(quote_) != address(0) && address(asset_) != address(0) && address(source_) != address(0)
                && admin_ != address(0) && manager_ != address(0),
            "cfg"
        );
        require(quote_ != asset_, "same");
        require(
            IERC20Metadata(address(quote_)).decimals() == 6
                && (IERC20Metadata(address(asset_)).decimals() == 6 || IERC20Metadata(address(asset_)).decimals() == 18)
                && source_.positionDecimals() == IERC20Metadata(address(asset_)).decimals(),
            "decimals"
        );
        require(policyHash_ == keccak256(bytes(NAV_POLICY_VERSION)), "policy");
        positionAsset = asset_;
        valuationSource = source_;
        admin = admin_;
        manager = manager_;
        managerVersion = 1;
        strategyHash = strategyHash_;
        riskHash = riskHash_;
        perTradeCap = perTradeCap_;
        maxPositionValue = maxPositionValue_;
        expenseBudget = expenseBudget_;
        minFirstDeposit = minFirstDeposit_;
        navPolicyHash = policyHash_;
        _openPeriod();
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyManager() {
        if (msg.sender != manager) revert NotManager();
        _;
    }

    function _configHash(ConfigArgs memory c) internal view returns (bytes32) {
        // Split into two encodings to stay within stack limits; the pair commits
        // to the full effective configuration (chain, vault, tokens, adapter,
        // venue, stream, source, caps, budget, strategy, risk, identity, policy).
        bytes32 h1 = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                address(asset()),
                address(positionAsset),
                c.adapter,
                c.venue,
                c.stream,
                c.valuationSource
            )
        );
        return keccak256(
            abi.encode(
                h1,
                c.perTradeCap,
                c.maxPositionValue,
                c.expenseBudget,
                c.strategyHash,
                c.riskHash,
                c.identityRegistry,
                c.agentId,
                NAV_POLICY_VERSION,
                navPolicyHash,
                manager,
                managerVersion,
                admin,
                c.adapter != address(0) && RestrictedSpotAdapter(c.adapter).revoked()
            )
        );
    }

    function _currentArgs() internal view returns (ConfigArgs memory c) {
        c = ConfigArgs({
            adapter: address(adapter),
            venue: _effectiveVenue(),
            stream: address(expenseStream),
            valuationSource: address(valuationSource),
            perTradeCap: perTradeCap,
            maxPositionValue: maxPositionValue,
            expenseBudget: expenseBudget,
            strategyHash: strategyHash,
            riskHash: riskHash,
            identityRegistry: identityRegistry,
            agentId: agentId
        });
    }

    function _effectiveVenue() internal view returns (address) {
        if (address(adapter) == address(0)) return address(0);
        return adapter.allowedVenue();
    }

    function currentConfigHash() public view returns (bytes32) {
        return _configHash(_currentArgs());
    }

    function periodEndNAV(uint256 id) external view returns (uint256) {
        return periods[id].endNAV;
    }

    function periodClosed(uint256 id) external view returns (bool) {
        return periods[id].closed;
    }

    function periodEndValued(uint256 id) external view returns (bool) {
        return periods[id].endValued;
    }

    function periodStartValued(uint256 id) external view returns (bool) {
        return periods[id].startValued;
    }

    function periodEndReason(uint256 id) external view returns (bytes32) {
        return periods[id].endReason;
    }

    /// @notice True when a boundary is unvalued: P&L must not be computed across it
    /// until the documented recovery (a later valued boundary) establishes a new anchor.
    function periodNeedsRecovery(uint256 id) external view returns (bool) {
        Period storage p = periods[id];
        if (!p.closed) return !p.startValued;
        return !p.startValued || !p.endValued;
    }

    bytes32 public constant REASON_ESCROW_UNDERFUNDED = keccak256("ESCROW_UNDERFUNDED");

    function _valuationStatus() internal view returns (bool, bytes32) {
        (bool ok, bytes32 reason) = valuationSource.status();
        if (!ok) return (false, reason);
        if (
            address(expenseStream) != address(0)
                && IERC20(asset()).balanceOf(address(expenseStream)) < expenseStream.escrowBalance()
        ) {
            return (false, REASON_ESCROW_UNDERFUNDED);
        }
        return (true, bytes32(0));
    }

    function _managedEscrow() internal view returns (uint256) {
        return address(expenseStream) == address(0) ? 0 : expenseStream.escrowBalance();
    }

    function _requireLive() internal view {
        if (paused) revert Paused();
        (bool ok, bytes32 reason) = _valuationStatus();
        if (!ok) revert ValuationUnavailable(reason);
    }

    function _live() internal view returns (bool ok, bytes32 reason, bool isPaused) {
        if (paused) return (false, bytes32(0), true);
        (ok, reason) = _valuationStatus();
        return (ok, reason, false);
    }

    /// @notice Gross managed value + accrued, without flooring: (gross, accrued, valued).
    function _gross() internal view returns (uint256 gross, uint256 accrued, bool valued) {
        (bool ok,) = _valuationStatus();
        if (!ok) return (0, accruedExpenses, false);
        uint256 q = IERC20(asset()).balanceOf(address(this));
        uint256 posBal = positionAsset.balanceOf(address(this));
        uint256 posVal = posBal == 0 ? 0 : valuationSource.markedValue(posBal);
        uint256 escrow = _managedEscrow();
        return (q + posVal + escrow, accruedExpenses, true);
    }

    /// @notice Ordinary issuance is blocked while liabilities cover gross assets.
    /// Exits (redeem/withdraw) stay open. Recovery is liability resolution through
    /// the governed expense path (settle/refund/reverse), never silent dilution.
    function _requireSolvent() internal view {
        (uint256 gross, uint256 accrued, bool valued) = _gross();
        if (!valued) {
            (, bytes32 reason) = _valuationStatus();
            revert ValuationUnavailable(reason);
        }
        if (gross < accrued || (gross == accrued && (accrued > 0 || totalSupply() > 0))) revert Insolvent();
    }

    function _isSolventView() internal view returns (bool) {
        (uint256 gross, uint256 accrued, bool valued) = _gross();
        if (!valued) return false;
        if (gross < accrued || (gross == accrued && (accrued > 0 || totalSupply() > 0))) return false;
        return true;
    }

    // ---- ERC4626-derived valuation-aware overrides (NOT strict ERC-4626) ----

    function _decimalsOffset() internal view override returns (uint8) {
        return 6;
    }

    /// @notice NAV per policy. Reverts on stale/unreliable valuation (no fabrication).
    function totalAssets() public view override returns (uint256) {
        (bool ok, bytes32 reason) = _valuationStatus();
        if (!ok) revert ValuationUnavailable(reason);
        (uint256 gross, uint256 accrued,) = _gross();
        if (gross <= accrued) return 0;
        return gross - accrued;
    }

    function _previewLive() internal view {
        if (paused) revert Paused();
        (bool ok, bytes32 reason) = _valuationStatus();
        if (!ok) revert ValuationUnavailable(reason);
    }

    function convertToShares(uint256 assets) public view override returns (uint256) {
        _previewLive();
        return super.convertToShares(assets);
    }

    function convertToAssets(uint256 shares) public view override returns (uint256) {
        _previewLive();
        return super.convertToAssets(shares);
    }

    function previewDeposit(uint256 assets) public view override returns (uint256) {
        _previewLive();
        return super.previewDeposit(assets);
    }

    function previewMint(uint256 shares) public view override returns (uint256) {
        _previewLive();
        return super.previewMint(shares);
    }

    function previewWithdraw(uint256 assets) public view override returns (uint256) {
        _previewLive();
        return super.previewWithdraw(assets);
    }

    function previewRedeem(uint256 shares) public view override returns (uint256) {
        _previewLive();
        return super.previewRedeem(shares);
    }

    function maxDeposit(address) public view override returns (uint256) {
        (bool ok,, bool isPaused) = _live();
        if (isPaused || !ok) return 0;
        if (!_isSolventView()) return 0;
        return type(uint256).max;
    }

    function maxMint(address) public view override returns (uint256) {
        (bool ok,, bool isPaused) = _live();
        if (isPaused || !ok) return 0;
        if (!_isSolventView()) return 0;
        return type(uint256).max;
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        (bool ok,, bool isPaused) = _live();
        if (isPaused || !ok) return 0;
        uint256 shares = balanceOf(owner);
        if (shares == 0) return 0;
        uint256 assets = super.convertToAssets(shares);
        uint256 q = IERC20(asset()).balanceOf(address(this));
        return assets > q ? q : assets;
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        (bool ok,, bool isPaused) = _live();
        if (isPaused || !ok) return 0;
        uint256 shares = balanceOf(owner);
        if (shares == 0) return 0;
        uint256 assets = super.convertToAssets(shares);
        uint256 q = IERC20(asset()).balanceOf(address(this));
        if (assets <= q) return shares;
        // Quote-liquidity bound: only the pro-rata shares covered by liquid quote are redeemable instantly.
        if (assets == 0) return 0;
        uint256 liquidShares = _convertToShares(q, Math.Rounding.Floor);
        return liquidShares < shares ? liquidShares : shares;
    }

    /// @notice Explicit liveness + solvency gates so stale/insolvent/paused rejections
    /// carry the real status, not just the generic ERC4626 max-exceeded error.
    /// @dev Bypass note: our maxDeposit/maxMint are vacuous (type(uint).max) whenever
    /// live+solvent, so entries check gates directly and convert via OZ internals
    /// instead of re-running the full max/preview chains. Rounding matches OZ
    /// previews exactly (deposit Floor, mint Ceil, withdraw Ceil, redeem Floor).
    function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256) {
        _requireLive();
        _requireSolvent();
        uint256 shares = _convertToShares(assets, Math.Rounding.Floor);
        _deposit(msg.sender, receiver, assets, shares);
        return shares;
    }

    function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256) {
        _requireLive();
        _requireSolvent();
        uint256 assets = _convertToAssets(shares, Math.Rounding.Ceil);
        _deposit(msg.sender, receiver, assets, shares);
        return assets;
    }

    function withdraw(uint256 assets, address receiver, address owner) public override nonReentrant returns (uint256) {
        _requireLive();
        uint256 shares = _convertToShares(assets, Math.Rounding.Ceil);
        _withdraw(msg.sender, receiver, owner, assets, shares);
        return shares;
    }

    function redeem(uint256 shares, address receiver, address owner) public override nonReentrant returns (uint256) {
        _requireLive();
        uint256 assets = _convertToAssets(shares, Math.Rounding.Floor);
        _withdraw(msg.sender, receiver, owner, assets, shares);
        return assets;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        // Gated on solvency at the deposit/mint entry points; re-checked here for
        // liveness only (entry state cannot change within the same call).
        _requireLive();
        if (shares == 0) revert ZeroShares();
        if (totalSupply() == 0 && assets < minFirstDeposit) revert FirstDepositTooSmall();
        IERC20 a = IERC20(asset());
        uint256 beforeBal = a.balanceOf(address(this));
        a.safeTransferFrom(caller, address(this), assets);
        if (a.balanceOf(address(this)) != beforeBal + assets) revert UnsupportedTokenTransfer();
        _mint(receiver, shares);
        emit Deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        _requireLive();
        if (shares == 0) revert ZeroShares();
        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }
        IERC20 a = IERC20(asset());
        if (assets > a.balanceOf(address(this))) revert InsufficientQuoteLiquidity();
        _burn(owner, shares);
        uint256 beforeVault = a.balanceOf(address(this));
        uint256 beforeReceiver = a.balanceOf(receiver);
        a.safeTransfer(receiver, assets);
        if (beforeVault - a.balanceOf(address(this)) != assets || a.balanceOf(receiver) - beforeReceiver != assets) {
            revert UnsupportedTokenTransfer();
        }
        emit Withdraw(caller, receiver, owner, assets, shares);
    }

    // ---- Restricted manager trading (MAN-01..04) ----

    /// @notice Manager-only spot trade through the restricted adapter.
    /// @dev perTradeCap is QUOTE notional in both directions: raw quote for buys,
    /// marked value for sells. Sells that strictly reduce exposure are permitted as
    /// partial unwinds even while drift keeps exposure above max (no exit deadlock);
    /// buys must land within max. Execution-time only; market drift is disclosed.
    function managerTrade(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        address venue
    ) external onlyManager nonReentrant returns (uint256 amountOut) {
        _requireLive();
        if (address(adapter) == address(0)) revert BadAddress();
        if (amountIn == 0 || minOut == 0) revert ExceedsPerTradeCap();
        if (
            (tokenIn != address(asset()) && tokenIn != address(positionAsset))
                || (tokenOut != address(asset()) && tokenOut != address(positionAsset)) || tokenIn == tokenOut
        ) revert ExceedsExposure();
        uint256 notional = _quoteNotional(tokenIn, amountIn);
        if (notional > perTradeCap) revert ExceedsPerTradeCap();
        uint256 preVal = _positionValue();
        uint256 beforeIn = IERC20(tokenIn).balanceOf(address(this));
        uint256 beforeOut = IERC20(tokenOut).balanceOf(address(this));
        amountOut = _dispatchTrade(tokenIn, tokenOut, amountIn, minOut, deadline, venue);
        // Verify no leakage: exact input spent, output received at vault (MAN-01/02).
        if (beforeIn - IERC20(tokenIn).balanceOf(address(this)) != amountIn) revert UnsupportedTokenTransfer();
        if (IERC20(tokenOut).balanceOf(address(this)) - beforeOut != amountOut) revert UnsupportedTokenTransfer();
        if (amountOut < minOut) revert ExceedsExposure();
        _checkExposureAfter(tokenIn, preVal);
        emit ManagerTrade(venue, tokenIn, tokenOut, amountIn, amountOut);
    }

    function _quoteNotional(address tokenIn, uint256 amountIn) internal view returns (uint256) {
        return tokenIn == address(asset())
            ? amountIn
            : Math.mulDiv(amountIn, valuationSource.price(), 1e18, Math.Rounding.Ceil);
    }

    function _positionValue() internal view returns (uint256) {
        uint256 bal = positionAsset.balanceOf(address(this));
        return bal == 0 ? 0 : valuationSource.markedValue(bal);
    }

    function _dispatchTrade(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        address venue
    ) internal returns (uint256 amountOut) {
        // Bound adapter approval to exactly this trade; reset after (MAN-03).
        IERC20(tokenIn).forceApprove(address(adapter), amountIn);
        amountOut = adapter.executeTrade(
            RestrictedSpotAdapter.Trade({
                venue: venue,
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                minOut: minOut,
                deadline: deadline,
                recipient: address(this)
            })
        );
        IERC20(tokenIn).forceApprove(address(adapter), 0);
        if (IERC20(tokenIn).allowance(address(this), address(adapter)) != 0) revert UnsupportedTokenTransfer();
    }

    function _checkExposureAfter(address tokenIn, uint256 preVal) internal view {
        uint256 postVal = _positionValue();
        if (tokenIn == address(positionAsset)) {
            // Risk-reducing sell: must strictly cut exposure; partial unwinds allowed.
            if (postVal >= preVal) revert ExceedsExposure();
        } else if (postVal > maxPositionValue) {
            revert ExceedsExposure();
        }
    }

    // ---- Admin: timelocked config (MAN-05), immediate safety controls ----

    /// @notice Propose the FULL effective configuration. Venue, stream, caps, budget,
    /// source, strategy/risk and identity ALL ride this notice; nothing effective
    /// changes here. There is no immediate venue/stream path by design.
    function proposeConfig(ConfigArgs calldata c) external onlyAdmin {
        _checkConfig(c);
        bytes32 h = _configHash(c);
        pending.args = c;
        pending.effectiveAt = uint64(block.timestamp) + uint64(CONFIG_DELAY);
        pending.exists = true;
        emit ConfigProposed(h, uint64(block.timestamp) + uint64(CONFIG_DELAY));
    }

    function _checkConfig(ConfigArgs memory c) internal view {
        if (c.valuationSource == address(0)) revert BadAddress();
        if (VaultValuationSource(c.valuationSource).positionDecimals() != IERC20Metadata(address(positionAsset)).decimals()) revert BadBinding();
        if (c.adapter == address(0)) {
            if (c.venue != address(0)) revert BadBinding();
        } else {
            RestrictedSpotAdapter next = RestrictedSpotAdapter(c.adapter);
            if (
                next.vault() != address(this) || next.quote() != asset() || next.asset() != address(positionAsset)
                    || c.venue == address(0) || c.venue.code.length == 0 || next.revoked()
            ) revert BadBinding();
        }
        if (c.identityRegistry == address(0)) {
            if (c.agentId != 0) revert BadBinding();
        } else {
            // Registration is provenance only. Binding another owner's advertised
            // history requires that owner's explicit authorization, not an admin assertion.
            address owner = IIdentityRegistry(c.identityRegistry).ownerOf(c.agentId);
            if (owner != manager && owner != admin) revert BadBinding();
        }
        if (c.stream != address(0)) _checkStreamBinding(c.stream);
    }

    function _checkStreamBinding(address stream) internal view {
        if (ServiceExpenseStream(stream).vault() != address(this)) revert BadBinding();
        if (address(ServiceExpenseStream(stream).quote()) != address(asset())) revert BadBinding();
        if (ServiceExpenseStream(stream).chainId() != block.chainid) revert BadBinding();
        if (IERC20(asset()).balanceOf(stream) < ServiceExpenseStream(stream).escrowBalance()) revert BadBinding();
    }

    /// @dev Only the explicit empty registration bootstrap may end an unvalued period.
    function _allowUnvaluedInitialConfig() internal view virtual returns (bool) { return false; }

    function applyConfig() external onlyAdmin nonReentrant {
        if (!pending.exists) revert NoPendingConfig();
        if (block.timestamp < pending.effectiveAt) revert ConfigNotReady();
        // Configuration boundaries need a valued NAV; governance waits for recovery.
        (bool ok, bytes32 reason) = _valuationStatus();
        if (!ok && !_allowUnvaluedInitialConfig()) revert ValuationUnavailable(reason);
        ConfigArgs memory c = pending.args;
        _checkConfig(c);
        (bool nextOk, bytes32 nextReason) = VaultValuationSource(c.valuationSource).status();
        if (!nextOk) revert ValuationUnavailable(nextReason);
        if (c.stream != address(expenseStream)) {
            if (_managedEscrow() != 0 || accruedExpenses != 0) revert DanglingEscrow();
        }
        _closePeriod();
        adapter = RestrictedSpotAdapter(c.adapter);
        if (address(adapter) != address(0) && c.venue != address(0)) {
            adapter.setVenue(c.venue);
        }
        valuationSource = VaultValuationSource(c.valuationSource);
        perTradeCap = c.perTradeCap;
        maxPositionValue = c.maxPositionValue;
        expenseBudget = c.expenseBudget;
        strategyHash = c.strategyHash;
        riskHash = c.riskHash;
        expenseStream = ServiceExpenseStream(c.stream);
        identityRegistry = c.identityRegistry;
        agentId = c.agentId;
        delete pending;
        _openPeriod();
        emit ConfigApplied(periodId, currentConfigHash());
        emit AdapterUpdated(address(adapter));
        emit VenueUpdated(_effectiveVenue());
        emit ValuationSourceUpdated(address(valuationSource));
        emit ExpenseStreamUpdated(address(expenseStream));
        emit IdentityBound(identityRegistry, agentId);
    }

    /// @notice Immediate safety action ONLY (documented): revoke a compromised adapter
    /// and clear its approvals. Not a configuration change; venue/stream/caps still
    /// require the timelocked procedure. Revocation records a safety period.
    function revokeAdapter() external onlyAdmin nonReentrant {
        _closePeriod();
        if (address(adapter) == address(0)) revert BadAddress();
        adapter.revoke();
        IERC20(asset()).forceApprove(address(adapter), 0);
        positionAsset.forceApprove(address(adapter), 0);
        _openPeriod();
    }

    /// @notice Immediate safety action (documented): revoke a compromised manager key.
    /// Works while valuation is stale or paused; the boundary is then recorded as
    /// UNVALUED (valued=false + reason + checkpoints), never as a valid zero.
    function rotateManager(address next, bytes32 newStrategyHash, bytes32 newRiskHash) external onlyAdmin nonReentrant {
        if (newStrategyHash != strategyHash || newRiskHash != riskHash) revert StrategyChangeRequiresNotice();
        if (next == address(0)) revert BadAddress();
        _closePeriod();
        address old = manager;
        manager = next;
        managerVersion += 1;
        strategyHash = newStrategyHash;
        riskHash = newRiskHash;
        _openPeriod();
        emit ManagerRotated(old, next, managerVersion);
    }

    function setAdmin(address next) external onlyAdmin nonReentrant {
        if (next == address(0)) revert BadAddress();
        _closePeriod();
        emit AdminChanged(admin, next);
        admin = next;
        _openPeriod();
    }

    function pause() external onlyAdmin {
        paused = true;
        emit PausedVault(msg.sender);
    }

    function unpause() external onlyAdmin {
        paused = false;
        emit UnpausedVault(msg.sender);
    }

    function _snapshot() internal view returns (uint256 cash, uint256 positions, uint256 escrow, uint256 accrued) {
        cash = IERC20(asset()).balanceOf(address(this));
        positions = positionAsset.balanceOf(address(this));
        escrow = _managedEscrow();
        accrued = accruedExpenses;
    }

    function _navSnapshot() internal view returns (uint256 nav, bool valued, bytes32 reason) {
        (bool ok, bytes32 why) = _valuationStatus();
        if (!ok) return (0, false, why);
        (uint256 gross, uint256 accrued,) = _gross();
        return (gross <= accrued ? 0 : gross - accrued, true, bytes32(0));
    }

    function _closePeriod() internal {
        Period storage p = periods[periodId];
        (uint256 nav, bool valued, bytes32 reason) = _navSnapshot();
        (uint256 cash, uint256 positions, uint256 escrow, uint256 accrued) = _snapshot();
        p.endBlock = uint64(block.number);
        p.endTime = uint64(block.timestamp);
        p.endNAV = nav;
        p.endValued = valued;
        p.endReason = reason;
        p.endCash = cash;
        p.endPositions = positions;
        p.endEscrow = escrow;
        p.endAccrued = accrued;
        p.closed = true;
        emit PeriodClosed(periodId, nav, valued);
    }

    function _openPeriod() internal {
        periodId += 1;
        (uint256 nav, bool valued, bytes32 reason) = _navSnapshot();
        (uint256 cash, uint256 positions, uint256 escrow, uint256 accrued) = _snapshot();
        Period storage p = periods[periodId];
        p.startBlock = uint64(block.number);
        p.startTime = uint64(block.timestamp);
        p.startNAV = nav;
        p.startValued = valued;
        p.startReason = reason;
        p.startCash = cash;
        p.startPositions = positions;
        p.startEscrow = escrow;
        p.startAccrued = accrued;
        p.configHash = currentConfigHash();
        p.strategyHash = strategyHash;
        p.riskHash = riskHash;
        p.manager = manager;
        p.identityRegistry = identityRegistry;
        p.agentId = agentId;
        emit PeriodOpened(periodId, p.configHash, strategyHash, manager, valued);
    }

    // ---- Manual expense escrow (PERF-03 / MAN-04; NOT timed streaming) ----

    function fundServiceExpense(uint256 amount, bytes32 serviceId, address recipient, uint256 nonce)
        external
        onlyAdmin
        nonReentrant
        returns (bytes32 obligationId)
    {
        if (address(expenseStream) == address(0)) revert BadAddress();
        if (amount == 0) revert ExceedsExpenseBudget();
        if (totalFunded + amount > expenseBudget) revert ExceedsExpenseBudget();
        IERC20 quote = IERC20(asset());
        uint256 beforeVault = quote.balanceOf(address(this));
        uint256 beforeEscrow = quote.balanceOf(address(expenseStream));
        quote.safeTransfer(address(expenseStream), amount);
        if (
            beforeVault - quote.balanceOf(address(this)) != amount
                || quote.balanceOf(address(expenseStream)) - beforeEscrow != amount
        ) revert UnsupportedTokenTransfer();
        totalFunded += amount;
        obligationId = expenseStream.fund(serviceId, recipient, amount, nonce, block.chainid);
        emit ExpenseFunded(obligationId, amount, serviceId, recipient);
    }

    function accrueServiceExpense(uint256 amount) external onlyAdmin {
        if (amount == 0) revert ExceedsExpenseBudget();
        if (totalSettled + accruedExpenses + amount > expenseBudget) revert ExceedsExpenseBudget();
        accruedExpenses += amount;
        emit ExpenseAccrued(amount, accruedExpenses);
    }

    function reverseAccrual(uint256 amount) external onlyAdmin {
        if (amount > accruedExpenses) revert ExceedsExpenseBudget();
        accruedExpenses -= amount;
        emit ExpenseAccrualReversed(amount, accruedExpenses);
    }

    function settleServiceExpense(bytes32 obligationId, uint256 amount, uint256 settleNonce)
        external
        onlyAdmin
        nonReentrant
    {
        if (address(expenseStream) == address(0)) revert BadAddress();
        if (amount == 0 || amount > accruedExpenses) revert ExceedsExpenseBudget();
        accruedExpenses -= amount;
        totalSettled += amount;
        expenseStream.settle(obligationId, amount, settleNonce);
        emit ExpenseSettled(obligationId, amount);
    }

    function refundServiceExpense(bytes32 obligationId, uint256 amount, uint256 refundNonce)
        external
        onlyAdmin
        nonReentrant
    {
        if (address(expenseStream) == address(0)) revert BadAddress();
        expenseStream.refund(obligationId, amount, refundNonce);
        emit ExpenseRefunded(obligationId, amount);
    }
}
