// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Single on-chain spot venue for the vertical slice (test tokens only).
/// @dev Holds quote/asset liquidity. Executes at its own quoted amounts;
/// vault valuation (mark) is independent and may differ, producing gain/loss.
/// Recipient MUST be the vault; enforced by the restricted adapter, checked here too.
contract MockSpotVenue {
    using SafeERC20 for IERC20;

    IERC20 public immutable quote;
    IERC20 public immutable asset;
    address public immutable adapter;

    error NotAdapter();
    error BadToken();
    error BadRecipient();
    error ZeroAmount();

    event Swapped(
        address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address indexed recipient
    );
    event LiquidityFunded(address indexed token, uint256 amount);

    constructor(IERC20 quote_, IERC20 asset_, address adapter_) {
        require(address(quote_) != address(0) && address(asset_) != address(0) && adapter_ != address(0), "cfg");
        require(quote_ != asset_, "same");
        quote = quote_;
        asset = asset_;
        adapter = adapter_;
    }

    function fund(address token, uint256 amount) external {
        if (token != address(quote) && token != address(asset)) revert BadToken();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit LiquidityFunded(token, amount);
    }

    /// @notice Swap pulled from the adapter; output goes to the vault recipient.
    /// @dev Only the allowlisted adapter may call. minOut enforces slippage.
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address recipient)
        external
        returns (uint256 amountOut)
    {
        if (msg.sender != adapter) revert NotAdapter();
        if (amountIn == 0) revert ZeroAmount();
        if (
            (tokenIn != address(quote) && tokenIn != address(asset))
                || (tokenOut != address(quote) && tokenOut != address(asset)) || tokenIn == tokenOut
        ) revert BadToken();
        // Venue has no knowledge of vault custody beyond recipient check; adapter guarantees recipient == vault.
        if (recipient == address(0) || recipient == address(this) || recipient == adapter) revert BadRecipient();
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        amountOut = amountIn; // 1:1 execution for the slice; P&L comes from mark movement.
        require(amountOut >= minOut, "slippage");
        IERC20(tokenOut).safeTransfer(recipient, amountOut);
        emit Swapped(tokenIn, tokenOut, amountIn, amountOut, recipient);
    }
}
