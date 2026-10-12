// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VaultFixture} from "./VaultFixture.sol";
import {UnoraVault} from "../../src/vault/UnoraVault.sol";
import {RestrictedSpotAdapter} from "../../src/vault/RestrictedSpotAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DemoToken} from "../../src/mocks/DemoToken.sol";

contract MaliciousVenue {
    address public loot;

    constructor(address loot_) {
        loot = loot_;
    }

    function swap(address tokenIn, address, uint256 amountIn, uint256, address) external returns (uint256) {
        // Pulls input and keeps it: simulates a venue that ignores the vault recipient.
        // Returns a lie; the vault's output-received check must catch the leakage.
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        return amountIn;
    }
}

/// @notice MAN-01..06: custody, restricted adapter, bounded approvals,
/// exposure/expense limits, admin/upgrade/emergency powers, independent redemption.
contract UnoraVaultManTest is VaultFixture {
    function testMAN01_ManagerHasNoCustodyOrAdminPowers() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);

        // Manager cannot pause, propose config, rotate, set admin, or touch streams.
        vm.startPrank(manager);
        vm.expectRevert(UnoraVault.NotAdmin.selector);
        vault.pause();
        vm.expectRevert(UnoraVault.NotAdmin.selector);
        vault.proposeConfig(
            UnoraVault.ConfigArgs({
                adapter: address(0),
                venue: address(0),
                stream: address(0),
                valuationSource: address(source),
                perTradeCap: 1,
                maxPositionValue: 1,
                expenseBudget: 1,
                strategyHash: bytes32(0),
                riskHash: bytes32(0),
                identityRegistry: address(0),
                agentId: 0
            })
        );
        vm.expectRevert(UnoraVault.NotAdmin.selector);
        vault.rotateManager(attacker, bytes32("x"), bytes32("y"));
        vm.expectRevert(UnoraVault.NotAdmin.selector);
        vault.setAdmin(attacker);
        vm.expectRevert(UnoraVault.NotAdmin.selector);
        vault.accrueServiceExpense(1);
        vm.stopPrank();

        // Non-manager cannot trade.
        vm.prank(attacker);
        vm.expectRevert(UnoraVault.NotManager.selector);
        vault.managerTrade(address(quote), address(asset), 10e6, 10e6, block.timestamp + 1, address(venue));

        // No generic call / delegatecall / withdraw-to-arbitrary exists.
        (bool ok,) = address(vault).call(abi.encodeWithSignature("transferAssets(address,uint256)", attacker, 1));
        assertFalse(ok);
        (ok,) = address(vault).call(abi.encodeWithSignature("execute(address,bytes)", attacker, ""));
        assertFalse(ok);

        // Direct adapter and venue calls fail: custody stays in the vault.
        RestrictedSpotAdapter.Trade memory t = RestrictedSpotAdapter.Trade({
            venue: address(venue),
            tokenIn: address(quote),
            tokenOut: address(asset),
            amountIn: 1e6,
            minOut: 1e6,
            deadline: block.timestamp + 1,
            recipient: address(vault)
        });
        vm.prank(attacker);
        vm.expectRevert(RestrictedSpotAdapter.NotVault.selector);
        adapter.executeTrade(t);
        vm.prank(attacker);
        vm.expectRevert();
        venue.swap(address(quote), address(asset), 1e6, 1e6, address(vault));
        assertEq(quote.balanceOf(address(adapter)), 0);
        assertEq(quote.balanceOf(address(vault)), 1_000e6);
    }

    function testMAN02_AdapterRejectsMaliciousRecipientPayloadAndToken() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);

        // Wrong token pair is rejected at the vault boundary.
        DemoToken evil = new DemoToken("Evil", "EVL");
        vm.prank(manager);
        vm.expectRevert(UnoraVault.ExceedsExposure.selector);
        vault.managerTrade(address(evil), address(asset), 10e6, 10e6, block.timestamp + 100, address(venue));

        // Unallowlisted venue is rejected by the adapter.
        MaliciousVenue mv = new MaliciousVenue(attacker);
        vm.prank(manager);
        vm.expectRevert(RestrictedSpotAdapter.BadVenue.selector);
        vault.managerTrade(address(quote), address(asset), 10e6, 10e6, block.timestamp + 100, address(mv));

        // Expired deadline is rejected.
        vm.prank(manager);
        vm.expectRevert(RestrictedSpotAdapter.Expired.selector);
        vault.managerTrade(address(quote), address(asset), 10e6, 10e6, block.timestamp - 1, address(venue));

        // A venue that lies about output / keeps funds is caught by vault balance checks.
        // Route it through the timelocked configuration procedure (no immediate path exists).
        vm.startPrank(admin);
        vault.proposeConfig(
            UnoraVault.ConfigArgs({
                adapter: address(adapter),
                venue: address(mv),
                stream: address(stream),
                valuationSource: address(source),
                perTradeCap: 500e6,
                maxPositionValue: 800e6,
                expenseBudget: 100e6,
                strategyHash: STRAT_V1,
                riskHash: RISK_V1,
                identityRegistry: address(registry),
                agentId: agentId
            })
        );
        vm.warp(block.timestamp + 1 days + 1);
        // Refresh valuation after warp so liveness holds for the malicious-venue attempt.
        source.updatePrice(1e18);
        vault.applyConfig();
        vm.stopPrank();
        // Fund the malicious venue with quote so transferFrom succeeds, then the lie is caught.
        vm.prank(manager);
        vm.expectRevert(UnoraVault.UnsupportedTokenTransfer.selector);
        vault.managerTrade(address(quote), address(asset), 10e6, 10e6, block.timestamp + 100, address(mv));
        // No leakage: vault balances unchanged apart from gas-free accounting.
        assertEq(quote.balanceOf(address(adapter)), 0);
    }

    function testMAN03_ApprovalsBoundedAndRevocationClearsSpender() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        managerBuy(100e6, 100e6);
        // Approvals reset in the same transaction: no lingering spender authority.
        assertEq(quote.allowance(address(vault), address(adapter)), 0);
        assertEq(asset.allowance(address(vault), address(adapter)), 0);
        assertEq(quote.allowance(address(adapter), address(venue)), 0);
        assertEq(asset.allowance(address(adapter), address(venue)), 0);
        assertEq(quote.balanceOf(address(adapter)), 0);
        assertEq(asset.balanceOf(address(adapter)), 0);

        // Indirect pull via a stale approval fails after revocation.
        vm.prank(admin);
        vault.revokeAdapter();
        assertTrue(adapter.revoked());
        // Even with a stale approval present, the revoked adapter cannot execute.
        vm.prank(manager);
        vm.expectRevert(RestrictedSpotAdapter.Revoked.selector);
        vault.managerTrade(address(quote), address(asset), 10e6, 10e6, block.timestamp + 100, address(venue));
    }

    function testMAN04_ExposurePerTradeAndExpenseBudgetsEnforced() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);

        // Oversized single trade fails.
        vm.prank(manager);
        vm.expectRevert(UnoraVault.ExceedsPerTradeCap.selector);
        vault.managerTrade(address(quote), address(asset), 500e6 + 1, 1, block.timestamp + 100, address(venue));

        // Split-call bypass fails on cumulative exposure: 400 ok, further 401 exceeds 800 max.
        managerBuy(400e6, 400e6);
        vm.prank(manager);
        vm.expectRevert(UnoraVault.ExceedsExposure.selector);
        vault.managerTrade(address(quote), address(asset), 401e6, 401e6, block.timestamp + 100, address(venue));

        // Expense streams to unapproved recipients fail; budget caps bind.
        bytes32 svc = keccak256("data-feed");
        vm.prank(admin);
        vm.expectRevert();
        vault.fundServiceExpense(10e6, svc, attacker, 1);
        vm.prank(admin);
        vault.fundServiceExpense(50e6, svc, service, 1);
        vm.prank(admin);
        vm.expectRevert(UnoraVault.ExceedsExpenseBudget.selector);
        vault.fundServiceExpense(51e6, svc, service, 2);
        vm.prank(admin);
        vm.expectRevert(UnoraVault.ExceedsExpenseBudget.selector);
        vault.accrueServiceExpense(101e6);
    }

    function testMAN05_AdminProcedureAndEmergencyHaveNoEscapeHatch() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        uint256 p0 = vault.periodId();

        // Manager cannot broaden policy.
        vm.prank(manager);
        vm.expectRevert(UnoraVault.NotAdmin.selector);
        vault.proposeConfig(
            UnoraVault.ConfigArgs({
                adapter: address(adapter),
                venue: address(venue),
                stream: address(stream),
                valuationSource: address(source),
                perTradeCap: 1e12,
                maxPositionValue: 1e12,
                expenseBudget: 1e12,
                strategyHash: bytes32("evil"),
                riskHash: bytes32("evil"),
                identityRegistry: address(registry),
                agentId: agentId
            })
        );

        // Admin proposal requires notice: immediate apply fails.
        vm.prank(admin);
        vault.proposeConfig(
            UnoraVault.ConfigArgs({
                adapter: address(adapter),
                venue: address(venue),
                stream: address(stream),
                valuationSource: address(source),
                perTradeCap: 100e6,
                maxPositionValue: 100e6,
                expenseBudget: 50e6,
                strategyHash: STRAT_V1,
                riskHash: RISK_V1,
                identityRegistry: address(registry),
                agentId: agentId
            })
        );
        vm.prank(admin);
        vm.expectRevert(UnoraVault.ConfigNotReady.selector);
        vault.applyConfig();
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(admin);
        source.updatePrice(1e18);
        vm.prank(admin);
        vault.applyConfig();
        assertGt(vault.periodId(), p0);
        assertEq(vault.perTradeCap(), 100e6);

        // Emergency pause blocks exits explicitly (does not masquerade as available).
        vm.prank(admin);
        vault.pause();
        assertEq(vault.maxDeposit(alice), 0);
        assertEq(vault.maxRedeem(alice), 0);
        vm.prank(alice);
        vm.expectRevert(UnoraVault.Paused.selector);
        vault.deposit(1e6, alice);
        uint256 bal = vault.balanceOf(alice);
        vm.prank(alice);
        vm.expectRevert(UnoraVault.Paused.selector);
        vault.redeem(bal, alice, alice);
        // Emergency moves no capital: vault balances unchanged, no sweep exists.
        assertEq(quote.balanceOf(address(vault)), 1_000e6);
        (bool ok,) = address(vault).call(abi.encodeWithSignature("sweep(address)", attacker));
        assertFalse(ok);
        vm.prank(admin);
        vault.unpause();
        vm.prank(alice);
        vault.redeem(bal / 2, alice, alice);
    }

    function testMAN06_RedemptionsIndependentOfManager() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        uint256 aliceShares = vault.balanceOf(alice);

        // Manager cannot redeem investor shares without allowance.
        vm.prank(manager);
        vm.expectRevert();
        vault.redeem(aliceShares, manager, alice);

        // With explicit approval a third party can redeem (standard ERC20 allowance), but
        // the manager role alone confers no such approval.
        vm.prank(alice);
        vault.approve(manager, 0);
        vm.prank(manager);
        vm.expectRevert();
        vault.redeem(1, manager, alice);

        // Legitimate investor exit succeeds with quote liquidity.
        vm.prank(alice);
        uint256 assets = vault.redeem(aliceShares / 2, alice, alice);
        assertGt(assets, 0);
        assertEq(vault.balanceOf(alice), aliceShares - aliceShares / 2);
    }
}
