// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Investor-owned, slippage-bounded deposits/exits for one fixed vault.
/// No administrator, sweep, arbitrary receiver or persistent vault allowance.
contract VaultInvestorGateway is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC4626 public immutable vault;
    IERC20 public immutable quote;
    error Limit();

    constructor(address vault_) {
        require(vault_.code.length > 0, "vault");
        vault = IERC4626(vault_);
        quote = IERC20(vault.asset());
    }

    function deposit(uint256 assets, uint256 minShares, uint256 deadline)
        external
        nonReentrant
        returns (uint256 shares)
    {
        if (block.timestamp > deadline || assets == 0 || minShares == 0) revert Limit();
        uint256 beforeCash = quote.balanceOf(address(this));
        uint256 beforeShares = vault.balanceOf(msg.sender);
        quote.safeTransferFrom(msg.sender, address(this), assets);
        if (quote.balanceOf(address(this)) != beforeCash + assets) revert Limit();
        quote.forceApprove(address(vault), assets);
        shares = vault.deposit(assets, msg.sender);
        quote.forceApprove(address(vault), 0);
        if (
            shares < minShares || vault.balanceOf(msg.sender) - beforeShares != shares
                || quote.balanceOf(address(this)) != beforeCash
                || quote.allowance(address(this), address(vault)) != 0
        ) revert Limit();
    }

    function redeem(uint256 shares, uint256 minAssets, uint256 deadline)
        external
        nonReentrant
        returns (uint256 assets)
    {
        if (block.timestamp > deadline || shares == 0 || minAssets == 0) revert Limit();
        uint256 beforeCash = quote.balanceOf(msg.sender);
        assets = vault.redeem(shares, msg.sender, msg.sender);
        if (assets < minAssets || quote.balanceOf(msg.sender) - beforeCash != assets) revert Limit();
    }
}
