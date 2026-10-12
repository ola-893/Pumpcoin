// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {UnoraVault} from "./UnoraVault.sol";
import {IV4Manager} from "./UniswapV4VaultVenue.sol";

interface INativeWrappedMON is IERC20 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}
interface INativeVaultPrice {
    function price() external view returns (uint256);
    function poolId() external view returns (bytes32);
}

/// @notice Atomic native MON entry/exit for one quote-denominated vault and one hook-free pool.
/// @dev Shares remain valued by the vault. Both conversion fees and strategy losses affect MON exits.
/// No owner-selected recipients, generic calls, admin withdrawals or retained token approvals.
contract NativeVaultInvestorGateway is ReentrancyGuard {
    using SafeERC20 for IERC20;
    UnoraVault public immutable vault;
    IERC20 public immutable quote;
    INativeWrappedMON public immutable wrappedMON;
    IV4Manager public immutable poolManager;
    INativeVaultPrice public immutable source;
    uint24 public immutable fee;
    int24 public immutable tickSpacing;
    uint16 public immutable slippageBps;
    bytes32 public immutable poolId;
    bytes32 private active;
    error InvalidInvestment();
    event NativeDeposit(address indexed investor, uint256 mon, uint256 quoteAssets, uint256 shares);
    event NativeRedemption(address indexed investor, uint256 shares, uint256 quoteAssets, uint256 mon);

    constructor(address vault_, address manager_, address source_, uint24 fee_, int24 spacing_, uint16 slippage_) {
        require(vault_.code.length > 0 && manager_.code.length > 0 && source_.code.length > 0, "code");
        vault = UnoraVault(vault_);
        require(msg.sender == vault.admin(), "controller");
        quote = IERC20(vault.asset());
        wrappedMON = INativeWrappedMON(address(vault.positionAsset()));
        require(address(quote) < address(wrappedMON), "token order");
        require(IERC20Metadata(address(quote)).decimals() == 6 && IERC20Metadata(address(wrappedMON)).decimals() == 18, "decimals");
        require(fee_ > 0 && fee_ < 1000000 && spacing_ > 0 && slippage_ > 0 && slippage_ <= 500, "limits");
        poolManager = IV4Manager(manager_);
        source = INativeVaultPrice(source_);
        fee = fee_; tickSpacing = spacing_; slippageBps = slippage_;
        poolId = keccak256(abi.encode(address(quote), address(wrappedMON), fee_, spacing_, address(0)));
        require(source.poolId() == poolId, "pool");
    }

    receive() external payable { if (msg.sender != address(wrappedMON)) revert InvalidInvestment(); }

    function minimumOutput(address tokenIn, uint256 amount) public view returns (uint256 result) {
        if (address(vault.valuationSource()) != address(source) || (tokenIn != address(quote) && tokenIn != address(wrappedMON))) revert InvalidInvestment();
        uint256 mark = source.price(); // Includes independent oracle, pool deviation and liquidity checks.
        if (mark == 0) revert InvalidInvestment();
        uint256 fair = tokenIn == address(quote) ? Math.mulDiv(amount, 1e18, mark) : Math.mulDiv(amount, mark, 1e18);
        result = Math.mulDiv(fair, 10000 - slippageBps, 10000, Math.Rounding.Ceil);
        if (result == 0) revert InvalidInvestment();
    }

    function depositMON(uint256 minQuote, uint256 minShares, uint256 deadline) external payable nonReentrant returns (uint256 assets, uint256 shares) {
        _deadline(deadline);
        if (msg.value == 0 || minQuote == 0 || minShares == 0) revert InvalidInvestment();
        uint256 nativeBefore = address(this).balance - msg.value;
        uint256 quoteBefore = quote.balanceOf(address(this));
        uint256 wrappedBefore = wrappedMON.balanceOf(address(this));
        uint256 sharesBefore = vault.balanceOf(msg.sender);
        wrappedMON.deposit{value: msg.value}();
        if (wrappedMON.balanceOf(address(this)) != wrappedBefore + msg.value) revert InvalidInvestment();
        assets = _swap(address(wrappedMON), msg.value, minQuote);
        quote.forceApprove(address(vault), assets);
        shares = vault.deposit(assets, msg.sender);
        quote.forceApprove(address(vault), 0);
        if (shares < minShares || vault.balanceOf(msg.sender) != sharesBefore + shares || quote.allowance(address(this), address(vault)) != 0) revert InvalidInvestment();
        _balances(nativeBefore, quoteBefore, wrappedBefore);
        emit NativeDeposit(msg.sender, msg.value, assets, shares);
    }

    function redeemMON(uint256 shares, uint256 minQuote, uint256 minMON, uint256 deadline) external nonReentrant returns (uint256 assets, uint256 mon) {
        _deadline(deadline);
        if (shares == 0 || minQuote == 0 || minMON == 0) revert InvalidInvestment();
        uint256 nativeBefore = address(this).balance;
        uint256 quoteBefore = quote.balanceOf(address(this));
        uint256 wrappedBefore = wrappedMON.balanceOf(address(this));
        uint256 sharesBefore = vault.balanceOf(msg.sender);
        assets = vault.redeem(shares, address(this), msg.sender);
        if (assets < minQuote || quote.balanceOf(address(this)) != quoteBefore + assets || vault.balanceOf(msg.sender) + shares != sharesBefore) revert InvalidInvestment();
        mon = _swap(address(quote), assets, minMON);
        wrappedMON.withdraw(mon);
        if (address(this).balance != nativeBefore + mon) revert InvalidInvestment();
        (bool sent,) = msg.sender.call{value: mon}("");
        if (!sent) revert InvalidInvestment();
        _balances(nativeBefore, quoteBefore, wrappedBefore);
        emit NativeRedemption(msg.sender, shares, assets, mon);
    }

    function _deadline(uint256 deadline) private view {
        if (block.timestamp > deadline || deadline > block.timestamp + 5 minutes) revert InvalidInvestment();
    }
    function _balances(uint256 nativeBefore, uint256 quoteBefore, uint256 wrappedBefore) private view {
        if (address(this).balance != nativeBefore || quote.balanceOf(address(this)) != quoteBefore || wrappedMON.balanceOf(address(this)) != wrappedBefore) revert InvalidInvestment();
    }
    function _swap(address tokenIn, uint256 amount, uint256 minOut) private returns (uint256 out) {
        if (amount == 0 || amount > uint256(uint128(type(int128).max))) revert InvalidInvestment();
        address tokenOut = tokenIn == address(quote) ? address(wrappedMON) : address(quote);
        uint256 floor = Math.max(minOut, minimumOutput(tokenIn, amount));
        uint256 beforeInput = IERC20(tokenIn).balanceOf(address(this));
        uint256 beforeOutput = IERC20(tokenOut).balanceOf(address(this));
        bytes memory data = abi.encode(tokenIn, tokenOut, amount, floor);
        active = keccak256(data);
        out = abi.decode(poolManager.unlock(data), (uint256));
        if (active != bytes32(0) || IERC20(tokenIn).balanceOf(address(this)) + amount != beforeInput || IERC20(tokenOut).balanceOf(address(this)) != beforeOutput + out || out < floor) revert InvalidInvestment();
    }
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager) || active == bytes32(0) || keccak256(data) != active) revert InvalidInvestment();
        active = bytes32(0);
        (address tokenIn, address tokenOut, uint256 amount, uint256 floor) = abi.decode(data, (address,address,uint256,uint256));
        bool zeroForOne = tokenIn == address(quote);
        int256 delta = poolManager.swap(
            IV4Manager.PoolKey(address(quote), address(wrappedMON), fee, tickSpacing, address(0)),
            IV4Manager.SwapParams(zeroForOne, -int256(amount), zeroForOne ? uint160(4295128740) : uint160(1461446703485210103287273052203988822378723970341)), ""
        );
        int128 paid = zeroForOne ? int128(delta >> 128) : int128(delta);
        int128 received = zeroForOne ? int128(delta) : int128(delta >> 128);
        if (int256(paid) != -int256(amount) || received <= 0 || uint128(received) < floor) revert InvalidInvestment();
        poolManager.sync(tokenIn);
        IERC20(tokenIn).safeTransfer(address(poolManager), amount);
        if (poolManager.settle() != amount) revert InvalidInvestment();
        poolManager.take(tokenOut, address(this), uint128(received));
        return abi.encode(uint256(uint128(received)));
    }
}
