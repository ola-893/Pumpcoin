// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IAdapterVenue {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address recipient)
        external
        returns (uint256);
}

/// @notice Restricted spot adapter: the ONLY trading path for vault capital.
/// @dev Validates venue, token pair, spender (venue), recipient (vault),
/// method (venue.swap only), amount, deadline and acceptable output (minOut).
/// No generic call, no delegatecall, no arbitrary payload. Approvals are exact
/// per trade and reset to zero in the same transaction (MAN-03).
/// Dust tolerance (P1 fix): unsolicited token dust sent directly to this adapter
/// must not block trading. Each trade reconciles balance DELTAS: everything the
/// adapter pulls from the vault must reach the venue, and the adapter must not
/// retain output (the venue pays the vault directly). Pre-existing balances are
/// left untouched: never swept, never required to be zero. There is no recovery
/// or sweep power on this contract by design.
contract RestrictedSpotAdapter {
    using SafeERC20 for IERC20;

    address public immutable vault;
    address public allowedVenue;
    address public immutable quote;
    address public immutable asset;
    bool public revoked;

    error NotVault();
    error Revoked();
    error BadVenue();
    error BadToken();
    error BadRecipient();
    error BadAmount();
    error Expired();
    error LeftoverApproval();
    error UnforwardedInput();
    error RetainedOutput();

    event TradeExecuted(
        address indexed venue,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    );
    event VenueUpdated(address indexed oldVenue, address indexed newVenue);
    event RevokedAdapter();

    constructor(address vault_, address venue_, address quote_, address asset_) {
        require(vault_ != address(0) && quote_ != address(0) && asset_ != address(0), "cfg");
        vault = vault_;
        allowedVenue = venue_;
        quote = quote_;
        asset = asset_;
    }

    /// @notice Vault admin rotates the venue through the vault (which opens a new period).
    function setVenue(address next) external {
        if (msg.sender != vault) revert NotVault();
        emit VenueUpdated(allowedVenue, next);
        allowedVenue = next;
    }

    function revoke() external {
        if (msg.sender != vault) revert NotVault();
        revoked = true;
        emit RevokedAdapter();
    }

    struct Trade {
        address venue;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minOut;
        uint256 deadline;
        address recipient;
    }

    /// @notice Execute one validated spot swap. Callable ONLY by the vault.
    function executeTrade(Trade calldata t) external returns (uint256 amountOut) {
        if (msg.sender != vault) revert NotVault();
        if (revoked) revert Revoked();
        if (t.venue != allowedVenue) revert BadVenue();
        if (
            (t.tokenIn != quote && t.tokenIn != asset) || (t.tokenOut != quote && t.tokenOut != asset)
                || t.tokenIn == t.tokenOut
        ) revert BadToken();
        if (t.recipient != vault) revert BadRecipient();
        if (t.amountIn == 0 || t.minOut == 0) revert BadAmount();
        if (t.deadline < block.timestamp) revert Expired();

        // Pull exact input from the vault (vault approved exact amount for this call).
        uint256 beforeIn = IERC20(t.tokenIn).balanceOf(address(this));
        uint256 beforeOut = IERC20(t.tokenOut).balanceOf(address(this));
        IERC20(t.tokenIn).safeTransferFrom(vault, address(this), t.amountIn);
        // Approve the venue for exactly this trade.
        IERC20(t.tokenIn).forceApprove(t.venue, t.amountIn);
        amountOut = IAdapterVenue(t.venue).swap(t.tokenIn, t.tokenOut, t.amountIn, t.minOut, t.recipient);
        // Reset venue approval; no stale spender authority (MAN-03).
        IERC20(t.tokenIn).forceApprove(t.venue, 0);
        if (IERC20(t.tokenIn).allowance(address(this), t.venue) != 0) revert LeftoverApproval();
        // Pass-through reconciliation: the pulled input must be fully forwarded and no
        // output may be retained. Unsolicited pre-existing dust (beforeIn/beforeOut) is
        // ignored and left in place; it neither blocks the trade nor is swept anywhere.
        if (IERC20(t.tokenIn).balanceOf(address(this)) != beforeIn) revert UnforwardedInput();
        if (IERC20(t.tokenOut).balanceOf(address(this)) != beforeOut) revert RetainedOutput();
        emit TradeExecuted(t.venue, t.tokenIn, t.tokenOut, t.amountIn, amountOut, t.recipient);
    }
}
