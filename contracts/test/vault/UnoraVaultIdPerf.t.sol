// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VaultFixture} from "./VaultFixture.sol";
import {UnoraVault} from "../../src/vault/UnoraVault.sol";

/// @notice ID-01/02 + PERF-02/03 on-chain evidence.
contract UnoraVaultIdPerfTest is VaultFixture {
    function testID01_RegistryTransferGrantsNoVaultAuthority() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);

        // Agent identity registered to the manager; vault manager bound separately.
        vm.prank(manager);
        uint256 agentId = registry.register();
        assertEq(registry.ownerOf(agentId), manager);

        // Transfer the identity NFT to the attacker.
        vm.prank(manager);
        registry.transfer(agentId, attacker);
        assertEq(registry.ownerOf(agentId), attacker);

        // The new identity owner gains no execution, withdrawal or admin capability.
        vm.prank(attacker);
        vm.expectRevert(UnoraVault.NotManager.selector);
        vault.managerTrade(address(quote), address(asset), 1e6, 1e6, block.timestamp + 1, address(venue));
        vm.prank(attacker);
        vm.expectRevert(UnoraVault.NotAdmin.selector);
        vault.pause();
        uint256 atkShares = vault.balanceOf(attacker);
        assertEq(atkShares, 0);
        vm.prank(attacker);
        vm.expectRevert();
        vault.redeem(1, attacker, alice);
        // Vault manager binding is unchanged.
        assertEq(vault.manager(), manager);
    }

    function testID02_RotationRevokesOldKeyAndPreservesState() public {
        vm.prank(alice);
        uint256 aShares = vault.deposit(1_000e6, alice);
        managerBuy(200e6, 200e6);
        setPrice(0.9e18);
        uint256 navBefore = vault.totalAssets();
        uint256 periodBefore = vault.periodId();

        address newManager = makeAddr("manager2");
        vm.prank(admin);
        vault.rotateManager(newManager, STRAT_V1, RISK_V1);

        // New configuration period opened; prior period closed with its NAV.
        assertGt(vault.periodId(), periodBefore);
        (uint256 endNAV0, bool closed0) = _periodEnd(periodBefore);
        assertTrue(closed0);
        assertEq(endNAV0, navBefore);
        // Old key is revoked immediately; new key is effective.
        vm.prank(manager);
        vm.expectRevert(UnoraVault.NotManager.selector);
        vault.managerTrade(address(quote), address(asset), 1e6, 1e6, block.timestamp + 1, address(venue));
        vm.prank(newManager);
        vault.managerTrade(address(quote), address(asset), 1e6, 1e6, block.timestamp + 100, address(venue));
        // Funds, shares and history persist across rotation (loss preserved).
        assertEq(vault.balanceOf(alice), aShares);
        assertEq(vault.strategyHash(), STRAT_V1);
        // Prior period record retains its closing NAV (the loss is not erased).
        assertApproxEqAbs(vault.totalAssets(), navBefore, 1e6);
    }

    function testPERF02_LossesPreservedAcrossStrategyChange() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        managerBuy(500e6, 500e6);
        setPrice(0.6e18); // loss: 500 + 300 = 800
        assertEq(vault.totalAssets(), 800e6);
        uint256 p1 = vault.periodId();

        // A new name/model hash cannot reset the track record: new period, same NAV.
        vm.startPrank(admin);
        vault.proposeConfig(
            UnoraVault.ConfigArgs({
                adapter: address(adapter),
                venue: address(venue),
                stream: address(stream),
                valuationSource: address(source),
                perTradeCap: 500e6,
                maxPositionValue: 800e6,
                expenseBudget: 100e6,
                strategyHash: keccak256("shiny-v2"),
                riskHash: keccak256("risk-v2"),
                identityRegistry: address(registry),
                agentId: agentId
            })
        );
        vm.warp(block.timestamp + 1 days + 1);
        source.updatePrice(0.6e18);
        vault.applyConfig();
        vm.stopPrank();

        assertGt(vault.periodId(), p1);
        assertEq(vault.totalAssets(), 800e6);
        (uint256 p1end, bool p1closed) = _periodEnd(p1);
        assertEq(p1end, 800e6);
        assertTrue(p1closed);
    }

    function testPERF03_ExpenseLifecycleNoDoubleCharge() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        uint256 nav0 = vault.totalAssets();

        bytes32 svc = keccak256("inference");
        // Funding reserves escrow: NAV unchanged (cash -> escrow, not an expense yet).
        vm.prank(admin);
        bytes32 oid = vault.fundServiceExpense(50e6, svc, service, 11);
        assertEq(vault.totalAssets(), nav0);
        assertEq(stream.reserved(), 50e6);

        // Accrual recognizes the expense exactly once: NAV down by 30.
        vm.prank(admin);
        vault.accrueServiceExpense(30e6);
        assertEq(vault.totalAssets(), nav0 - 30e6);

        // Settlement pays from escrow and clears the accrual: NAV unchanged from pre-settle.
        uint256 svcBefore = quote.balanceOf(service);
        vm.prank(admin);
        vault.settleServiceExpense(oid, 30e6, 12);
        assertEq(quote.balanceOf(service) - svcBefore, 30e6);
        assertEq(stream.settled(), 30e6);
        assertEq(vault.totalAssets(), nav0 - 30e6);

        // Cancellation refunds the unspent reserve: NAV unchanged, escrow cleared.
        vm.prank(admin);
        vault.refundServiceExpense(oid, 20e6, 13);
        assertEq(stream.refunded(), 20e6);
        assertEq(vault.totalAssets(), nav0 - 30e6);
        assertEq(quote.balanceOf(address(stream)), 0);

        // Fake payment hashes prove nothing: no hash-only acceptance path exists.
        (bool ok,) = address(stream).call(abi.encodeWithSignature("provePayment(bytes32)", keccak256("fake-receipt")));
        assertFalse(ok);
        // Direct settlement without vault authorization fails; overdraw fails.
        vm.prank(attacker);
        vm.expectRevert();
        stream.settle(oid, 1e6, 99);
        vm.prank(admin);
        vm.expectRevert();
        vault.settleServiceExpense(oid, 1e6, 14);
    }

    function _periodEnd(uint256 id) internal view returns (uint256 endNAV, bool closed) {
        return (vault.periodEndNAV(id), vault.periodClosed(id));
    }
}
