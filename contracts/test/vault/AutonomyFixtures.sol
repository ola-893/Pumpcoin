// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

// TEST ONLY. Deterministic 1:1 whole-token fixture, not a live price oracle or DEX.
contract AutonomySourceFixture {
    uint8 public immutable positionDecimals;
    uint256 public immutable price;
    constructor(uint8 d) { positionDecimals = d; price = 10 ** (24 - uint256(d)); }
    function status() external pure returns (bool, bytes32) { return (true, bytes32(0)); }
    function requireAvailable() external pure {}
    function markedValue(uint256 n) external view returns (uint256) { return Math.mulDiv(n, price, 1e18); }
}
contract AutonomyVenueFixture {
    using SafeERC20 for IERC20;
    address public immutable adapter;
    IERC20 public immutable quote;
    IERC20 public immutable position;
    uint256 public immutable multiplier;
    constructor(address a, IERC20 q, IERC20 p, uint8 d) { adapter = a; quote = q; position = p; multiplier = 10 ** (uint256(d) - 6); }
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address recipient) external returns (uint256 out) {
        require(msg.sender == adapter, "adapter");
        require((tokenIn == address(quote) && tokenOut == address(position)) || (tokenIn == address(position) && tokenOut == address(quote)), "pair");
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        out = tokenIn == address(quote) ? amountIn * multiplier : amountIn / multiplier;
        require(out >= minOut, "slippage"); IERC20(tokenOut).safeTransfer(recipient, out);
    }
}
