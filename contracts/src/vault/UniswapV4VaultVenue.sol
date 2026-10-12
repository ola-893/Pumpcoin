// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {RestrictedSpotAdapter} from "./RestrictedSpotAdapter.sol";

interface IV4Price {
    function price() external view returns (uint256);
}

interface IV4Manager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }
    function unlock(bytes calldata) external returns (bytes memory);
    function swap(PoolKey calldata, SwapParams calldata, bytes calldata) external returns (int256);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
}

/// @notice One hook-free v4 pool; exact input only, no generic calls or approvals.
/// The adapter supplies the deadline and only this vault may receive output.
/// Partial fills revert; settlement must consume exactly the authorized input.
contract UniswapV4VaultVenue is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable adapter;
    address public immutable vault;
    address public immutable quote;
    address public immutable position;
    IV4Manager public immutable poolManager;
    IV4Price public immutable source;
    uint24 public immutable fee;
    int24 public immutable tickSpacing;
    uint16 public immutable slippageBps;
    bytes32 public immutable poolId;
    bytes32 private active;
    error InvalidTrade();

    constructor(
        address adapter_,
        address manager_,
        address source_,
        uint24 fee_,
        int24 spacing_,
        uint16 slippage_
    ) {
        require(adapter_.code.length > 0 && manager_.code.length > 0 && source_.code.length > 0, "code");
        require(fee_ > 0 && fee_ < 1000000 && spacing_ > 0 && slippage_ > 0 && slippage_ <= 500, "limits");
        RestrictedSpotAdapter a = RestrictedSpotAdapter(adapter_);
        adapter = adapter_;
        vault = a.vault();
        quote = a.quote();
        position = a.asset();
        require(quote < position, "token order"); // current supported testnet pair only
        poolManager = IV4Manager(manager_);
        source = IV4Price(source_);
        fee = fee_;
        tickSpacing = spacing_;
        slippageBps = slippage_;
        poolId = keccak256(abi.encode(quote, position, fee_, spacing_, address(0)));
    }

    function minimumOutput(address tokenIn, uint256 amount) public view returns (uint256 result) {
        if (tokenIn != quote && tokenIn != position) revert InvalidTrade();
        uint256 mark = source.price();
        uint256 fair = tokenIn == quote ? Math.mulDiv(amount, 1e18, mark) : Math.mulDiv(amount, mark, 1e18);
        result = Math.mulDiv(fair, 10000 - slippageBps, 10000, Math.Rounding.Ceil);
        if (result == 0) revert InvalidTrade();
    }

    function swap(address tokenIn, address tokenOut, uint256 amount, uint256 minOut, address recipient)
        external
        nonReentrant
        returns (uint256 out)
    {
        if (
            msg.sender != adapter || recipient != vault || amount == 0
                || amount > uint256(uint128(type(int128).max)) || minOut == 0
                || !((tokenIn == quote && tokenOut == position) || (tokenIn == position && tokenOut == quote))
        ) revert InvalidTrade();
        uint256 floor = minimumOutput(tokenIn, amount);
        if (minOut > floor) floor = minOut;
        IERC20 input = IERC20(tokenIn);
        uint256 beforeInput = input.balanceOf(address(this));
        uint256 beforeOutput = IERC20(tokenOut).balanceOf(vault);
        input.safeTransferFrom(adapter, address(this), amount);
        if (input.balanceOf(address(this)) != beforeInput + amount) revert InvalidTrade();
        bytes memory data = abi.encode(tokenIn, tokenOut, amount, floor);
        active = keccak256(data);
        out = abi.decode(poolManager.unlock(data), (uint256));
        if (
            active != bytes32(0) || input.balanceOf(address(this)) != beforeInput
                || IERC20(tokenOut).balanceOf(vault) - beforeOutput != out || out < floor
        ) revert InvalidTrade();
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager) || active == bytes32(0) || keccak256(data) != active) {
            revert InvalidTrade();
        }
        active = bytes32(0);
        (address tokenIn, address tokenOut, uint256 amount, uint256 floor) =
            abi.decode(data, (address, address, uint256, uint256));
        bool zeroForOne = tokenIn == quote;
        int256 delta = poolManager.swap(
            IV4Manager.PoolKey(quote, position, fee, tickSpacing, address(0)),
            IV4Manager.SwapParams(
                zeroForOne,
                -int256(amount),
                zeroForOne ? uint160(4295128740) : uint160(1461446703485210103287273052203988822378723970341)
            ),
            ""
        );
        int128 d0 = int128(delta >> 128);
        int128 d1 = int128(delta);
        int128 paid = zeroForOne ? d0 : d1;
        int128 received = zeroForOne ? d1 : d0;
        if (int256(paid) != -int256(amount) || received <= 0 || uint128(received) < floor) revert InvalidTrade();
        poolManager.sync(tokenIn);
        IERC20(tokenIn).safeTransfer(address(poolManager), amount);
        if (poolManager.settle() != amount) revert InvalidTrade();
        poolManager.take(tokenOut, vault, uint128(received));
        return abi.encode(uint256(uint128(received)));
    }
}
