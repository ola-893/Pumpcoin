// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AttestationRegistry, DataSourceType, Tier} from "./AttestationRegistry.sol";

interface IAgentCreditMandateConfig {
    function creditLine() external view returns (address);
    function loanToken() external view returns (IERC20);
}

/// @notice Test-token demonstration of a credential-controlled borrowing limit.
/// @dev Collateral and loan tokens must have equal decimals and assumed 1:1 unit value.
/// No price feed, liquidation, interest, LP shares, or real-asset risk management.
contract CreditLine is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BASE_LTV_BPS = 5000;
    uint256 public constant BOOSTED_LTV_BPS = 8000;
    AttestationRegistry public immutable registry;
    IERC20 public immutable collateralToken;
    IERC20 public immutable loanToken;
    mapping(address => uint256) public collateralOf;
    mapping(address => uint256) public borrowedOf;
    uint256 public totalCollateral;
    uint256 public totalBorrowed;
    mapping(address => address) public migrationRequested;
    address public agentCreditMandate;

    error InvalidConfiguration();
    error ZeroAmount();
    error ExceedsLimit();
    error InsufficientLiquidity();
    error InsufficientCollateral();
    error ExceedsDebt();
    error UnsupportedTokenTransfer();
    error InvalidMigration();
    error NotRoot();
    error NotMandate();

    event Deposited(address indexed borrower, uint256 amount);
    event Withdrawn(address indexed borrower, uint256 amount);
    event Borrowed(address indexed borrower, uint256 amount);
    event Repaid(address indexed borrower, uint256 amount);
    event RepaidFor(address indexed payer, address indexed borrower, uint256 amount);
    event LiquidityFunded(address indexed funder, uint256 amount);
    event MigrationRequested(address indexed previous, address indexed next);
    event PositionMigrated(address indexed previous, address indexed next, uint256 collateral, uint256 debt);
    event AgentCreditMandatePinned(address indexed mandate);
    event BorrowedFor(address indexed caller, address indexed human, uint256 amount);

    constructor(AttestationRegistry registry_, IERC20 collateralToken_, IERC20 loanToken_) {
        if (
            address(registry_).code.length == 0 || address(collateralToken_).code.length == 0
                || address(loanToken_).code.length == 0 || collateralToken_ == loanToken_
        ) revert InvalidConfiguration();
        if (IERC20Metadata(address(collateralToken_)).decimals() != IERC20Metadata(address(loanToken_)).decimals()) {
            revert InvalidConfiguration();
        }
        registry = registry_;
        collateralToken = collateralToken_;
        loanToken = loanToken_;
    }

    function ltvBps(address user) public view returns (uint256) {
        return
            registry.isValid(user, DataSourceType.PAYMENT_PROCESSOR_REVENUE, Tier.TIER_2)
                ? BOOSTED_LTV_BPS
                : BASE_LTV_BPS;
    }

    /// @notice Total allowed debt, not the remaining amount available to borrow.
    function maxBorrow(address user) public view returns (uint256) {
        return _limit(user, collateralOf[user]);
    }

    function _limit(address user, uint256 collateral) private view returns (uint256) {
        uint256 limit = Math.mulDiv(collateral, ltvBps(user), 10_000);
        if (
            registry.evidenceMode()
                && (IERC20Metadata(address(loanToken)).decimals() != 6
                    || registry.positionController() != address(this))
        ) {
            revert InvalidConfiguration();
        }
        return registry.evidenceMode() ? Math.min(limit, registry.eligibilityCeiling(user)) : limit;
    }

    /// @notice Old wallet authorizes a destination; address(0) cancels. New wallet must accept.
    function requestMigration(address next) external {
        if (
            !registry.evidenceMode() || registry.sourceOf(msg.sender) == bytes32(0)
                || registry.retiredWallet(msg.sender) || next == msg.sender
        ) revert InvalidMigration();
        migrationRequested[msg.sender] = next;
        emit MigrationRequested(msg.sender, next);
    }

    function acceptMigration(address previous) external nonReentrant {
        if (migrationRequested[previous] != msg.sender || collateralOf[msg.sender] != 0 || borrowedOf[msg.sender] != 0) revert InvalidMigration();
        registry.migrateSubject(previous, msg.sender);
        uint256 collateral = collateralOf[previous];
        uint256 debt = borrowedOf[previous];
        collateralOf[msg.sender] = collateral;
        borrowedOf[msg.sender] = debt;
        delete collateralOf[previous];
        delete borrowedOf[previous];
        delete migrationRequested[previous];
        emit PositionMigrated(previous, msg.sender, collateral, debt);
    }

    function availableToBorrow(address user) external view returns (uint256) {
        uint256 limit = maxBorrow(user);
        uint256 headroom = limit > borrowedOf[user] ? limit - borrowedOf[user] : 0;
        return Math.min(headroom, loanToken.balanceOf(address(this)));
    }

    /// @notice Demo liquidity contribution; does not create a withdrawable LP position.
    function fundLiquidity(uint256 amount) external nonReentrant {
        _receiveExact(loanToken, amount);
        emit LiquidityFunded(msg.sender, amount);
    }

    function deposit(uint256 amount) external nonReentrant {
        _receiveExact(collateralToken, amount);
        collateralOf[msg.sender] += amount;
        totalCollateral += amount;
        emit Deposited(msg.sender, amount);
    }

    function borrow(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 limit = maxBorrow(msg.sender);
        uint256 debt = borrowedOf[msg.sender];
        if (debt > limit || amount > limit - debt) revert ExceedsLimit();
        if (amount > loanToken.balanceOf(address(this))) revert InsufficientLiquidity();
        borrowedOf[msg.sender] = debt + amount;
        totalBorrowed += amount;
        loanToken.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    /// @notice One-time, root-authorized wiring on a fresh stack. Existing deployments are not upgraded.
    function pinAgentCreditMandate(address mandate) external {
        if (msg.sender != registry.rootController()) revert NotRoot();
        if (
            agentCreditMandate != address(0) || mandate.code.length == 0
                || IAgentCreditMandateConfig(mandate).creditLine() != address(this)
                || IAgentCreditMandateConfig(mandate).loanToken() != loanToken
        ) revert InvalidConfiguration();
        agentCreditMandate = mandate;
        emit AgentCreditMandatePinned(mandate);
    }

    /// @notice Only the pinned mandate may create debt for its consenting human backer.
    /// @dev Enforces exactly the same current eligibility, collateral and liquidity limits as borrow().
    function borrowFor(address human, uint256 amount) external nonReentrant {
        if (msg.sender != agentCreditMandate || msg.sender == address(0)) revert NotMandate();
        if (human == address(0)) revert InvalidConfiguration();
        if (amount == 0) revert ZeroAmount();
        uint256 limit = maxBorrow(human);
        uint256 debt = borrowedOf[human];
        if (debt > limit || amount > limit - debt) revert ExceedsLimit();
        if (amount > loanToken.balanceOf(address(this))) revert InsufficientLiquidity();
        borrowedOf[human] = debt + amount;
        totalBorrowed += amount;
        loanToken.safeTransfer(msg.sender, amount);
        emit Borrowed(human, amount);
        emit BorrowedFor(msg.sender, human, amount);
    }

    function repay(uint256 amount) external nonReentrant {
        if (amount > borrowedOf[msg.sender]) revert ExceedsDebt();
        _receiveExact(loanToken, amount);
        borrowedOf[msg.sender] -= amount;
        totalBorrowed -= amount;
        emit Repaid(msg.sender, amount);
    }

    /// @notice Anyone may pay another borrower's debt using the caller's own loan tokens.
    function repayFor(address borrower, uint256 amount) external nonReentrant {
        if (borrower == address(0)) revert InvalidConfiguration();
        if (amount > borrowedOf[borrower]) revert ExceedsDebt();
        _receiveExact(loanToken, amount);
        borrowedOf[borrower] -= amount;
        totalBorrowed -= amount;
        emit Repaid(borrower, amount);
        emit RepaidFor(msg.sender, borrower, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 collateral = collateralOf[msg.sender];
        if (amount > collateral) revert InsufficientCollateral();
        uint256 remaining = collateral - amount;
        if (borrowedOf[msg.sender] > _limit(msg.sender, remaining)) {
            revert ExceedsLimit();
        }
        collateralOf[msg.sender] = remaining;
        totalCollateral -= amount;
        collateralToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function _receiveExact(IERC20 token, uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedTokenTransfer();
    }
}
