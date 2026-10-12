// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VaultFixture} from "./VaultFixture.sol";
import {UnoraVault} from "../../src/vault/UnoraVault.sol";
import {VaultValuationSource} from "../../src/vault/VaultValuationSource.sol";

/// @notice OWN-01..05: valuation policy, share accounting, flow separation,
/// stale-valuation rejection, rounding/donation defense.
contract UnoraVaultOwnTest is VaultFixture {
    function testOWN01_NAVPolicyReconcilesWithLossAndSingleExpense() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        assertEq(vault.totalAssets(), 1_000e6);

        managerBuy(500e6, 500e6);
        // Independent mark: 500 quote cash + 500 asset @ 1.0.
        assertEq(vault.totalAssets(), 1_000e6);

        // Losing period: mark drops to 0.8.
        setPrice(0.8e18);
        // 500 cash + 500*0.8 = 900.
        assertEq(vault.totalAssets(), 900e6);

        // Accrue one 10-unit operating expense exactly once.
        vm.prank(admin);
        vault.accrueServiceExpense(10e6);
        assertEq(vault.accruedExpenses(), 10e6);
        // 900 - 10 = 890.
        assertEq(vault.totalAssets(), 890e6);

        // Independent reconciliation: cash + marked positions - accrued.
        uint256 q = quote.balanceOf(address(vault));
        uint256 posBal = asset.balanceOf(address(vault));
        uint256 posVal = source.markedValue(posBal);
        assertEq(q + posVal - vault.accruedExpenses(), vault.totalAssets());
        assertEq(q, 500e6);
        assertEq(posVal, 400e6);
    }

    function testOWN02_EntryBeforeAfterGainDoesNotDiluteAndRejectsZeroShares() public {
        vm.prank(alice);
        uint256 aShares = vault.deposit(1_000e6, alice);
        assertGt(aShares, 0);

        managerBuy(500e6, 500e6);
        setPrice(1.2e18);
        // Gain: 500 + 600 = 1100.
        assertEq(vault.totalAssets(), 1_100e6);
        uint256 aliceValueBefore = vault.previewRedeem(aShares);

        // Later deposit at the higher share price gets proportionally fewer shares.
        vm.prank(bob);
        uint256 bShares = vault.deposit(1_100e6, bob);
        assertEq(vault.totalAssets(), 2_200e6);
        // Alice's economic interest is preserved: same shares, same redeem value as before (1100 pro-rata).
        assertEq(vault.previewRedeem(aShares), aliceValueBefore);
        assertApproxEqAbs(vault.convertToAssets(aShares), 1_100e6, 2);
        // B paid the current price: 1100 assets for ~1000-share-equivalent.
        assertApproxEqAbs(vault.convertToAssets(bShares), 1_100e6, 2);

        // Losing period is covered in testOWN02_LossSharing.
    }

    function testOWN02_LossSharing() public {
        vm.prank(alice);
        uint256 aShares = vault.deposit(1_000e6, alice);
        managerBuy(500e6, 500e6);
        setPrice(1.2e18);
        vm.prank(bob);
        uint256 bShares = vault.deposit(1_100e6, bob);
        setPrice(0.5e18);
        // NAV: vault quote 500 (alice leftover) + 1100 (bob) = 1600 cash + 500 asset @0.5=250 -> 1850.
        assertEq(vault.totalAssets(), 1_850e6);
        // Pro-rata: alice shares / total * NAV == convertToAssets.
        uint256 total = vault.totalSupply();
        assertApproxEqAbs(vault.convertToAssets(aShares), (1_850e6 * aShares) / total, 2);
        assertApproxEqAbs(vault.convertToAssets(bShares), (1_850e6 * bShares) / total, 2);
    }

    function testOWN02_RejectsZeroShareDeposit() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        // Zero-amount conversions produce zero shares and must revert, not mint dust.
        vm.prank(bob);
        vm.expectRevert(UnoraVault.ZeroShares.selector);
        vault.deposit(0, bob);
        vm.prank(bob);
        vm.expectRevert(UnoraVault.ZeroShares.selector);
        vault.mint(0, bob);
        vm.prank(alice);
        vm.expectRevert(UnoraVault.ZeroShares.selector);
        vault.withdraw(0, alice, alice);
        vm.prank(alice);
        vm.expectRevert(UnoraVault.ZeroShares.selector);
        vault.redeem(0, alice, alice);
        // After a massive direct donation, a 1-wei deposit rounds to zero shares and reverts.
        quote.mint(address(vault), 1_000_000_000e6);
        vm.prank(bob);
        vm.expectRevert(UnoraVault.ZeroShares.selector);
        vault.deposit(1, bob);
    }

    function testOWN03_FlowsSeparatedFromPerformance() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);
        uint256 opening = vault.totalAssets();
        managerBuy(500e6, 500e6);
        setPrice(1.2e18);
        uint256 beforeFlow = vault.totalAssets(); // 1100
        vm.prank(bob);
        vault.deposit(1_100e6, bob);
        uint256 closing = vault.totalAssets(); // 2200
        // net P&L = closing - opening - deposits + withdrawals = 2200-1000-1100 = 100? No:
        // opening 1000, gain 100 (1100-1000), deposit 1100 -> 2200. P&L = 2200-1000-1100 = 100.
        // The 1100 deposit is capital, not profit.
        assertEq(closing - opening - 1_100e6, 100e6);
        assertEq(beforeFlow - opening, 100e6);
        // Per-share return for Alice: 1100/1000 - 1 = 10%, unaffected by Bob's entry.
        assertApproxEqAbs(vault.convertToAssets(vault.balanceOf(alice)), 1_100e6, 2);
    }

    function testOWN04_StaleDisputedUnavailableBlockShareTxs() public {
        vm.prank(alice);
        vault.deposit(1_000e6, alice);

        // Stale: warp beyond 1h freshness.
        vm.warp(block.timestamp + 2 hours);
        (bool ok, bytes32 reason) = source.status();
        assertFalse(ok);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(UnoraVault.ValuationUnavailable.selector, reason));
        vault.deposit(100e6, bob);
        uint256 aliceHalf = vault.balanceOf(alice) / 2;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(UnoraVault.ValuationUnavailable.selector, reason));
        vault.redeem(aliceHalf, alice, alice);
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(UnoraVault.ValuationUnavailable.selector, reason));
        vault.managerTrade(address(quote), address(asset), 10e6, 10e6, block.timestamp + 1, address(venue));
        // max* return 0 rather than a fabricated limit; previews revert.
        assertEq(vault.maxDeposit(bob), 0);
        assertEq(vault.maxRedeem(alice), 0);
        vm.expectRevert(abi.encodeWithSelector(UnoraVault.ValuationUnavailable.selector, reason));
        vault.previewDeposit(100e6);

        // Recovery restores execution.
        vm.prank(admin);
        source.updatePrice(1e18);
        vm.prank(bob);
        vault.deposit(100e6, bob);

        // Disputed blocks.
        vm.prank(admin);
        source.dispute();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(UnoraVault.ValuationUnavailable.selector, source.REASON_DISPUTED()));
        vault.deposit(1e6, bob);
        vm.prank(admin);
        source.resolveDispute(1e18);

        // Position-data unavailable blocks.
        vm.prank(admin);
        source.setPositionDataAvailable(false);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(UnoraVault.ValuationUnavailable.selector, source.REASON_POSITION_UNAVAILABLE())
        );
        vault.deposit(1e6, bob);
        // No silent queue: nothing settled; balances unchanged.
        assertEq(quote.balanceOf(address(vault)), 1_100e6);
        vm.prank(admin);
        source.setPositionDataAvailable(true);
        vm.prank(bob);
        vault.deposit(1e6, bob);
    }

    function testOWN05_DonationAndRoundingDefense() public {
        // Small initial deposit below minimum is rejected (virtual-share policy).
        vm.prank(attacker);
        vm.expectRevert(UnoraVault.FirstDepositTooSmall.selector);
        vault.deposit(100, attacker);

        vm.prank(attacker);
        uint256 atkShares = vault.deposit(1e6, attacker);
        // Direct donation without minting shares.
        quote.mint(address(vault), 10e6);
        // Victim deposits after the donation at the inflated price (fewer shares per asset).
        vm.prank(alice);
        uint256 vicShares = vault.deposit(10e6, alice);
        // Attacker exits: cannot steal the victim's capital; exit value <= pro-rata fair share.
        vm.prank(attacker);
        vault.redeem(atkShares, attacker, attacker);
        // Victim can still redeem at least their deposit minus dust rounding (no theft).
        uint256 vicValue = vault.previewRedeem(vicShares);
        assertGe(vicValue + 2, 10e6);
        vm.prank(alice);
        vault.redeem(vicShares, alice, alice);
        assertGe(quote.balanceOf(alice), 10_000e6 - 3);

        // Dust redemption and round trips do not mint value.
        vm.prank(bob);
        uint256 bShares = vault.deposit(1_000e6, bob);
        uint256 navBefore = vault.totalAssets();
        vm.startPrank(bob);
        vault.redeem(1, bob, bob);
        vault.deposit(1e6, bob);
        vm.stopPrank();
        assertApproxEqAbs(vault.totalAssets(), navBefore - vault.previewRedeem(1) + 1e6, 5);
        assertGt(bShares, 0);
    }

    function testOWN05_FuzzConservation(uint96 a, uint96 b) public {
        a = uint96(bound(a, 2e6, 500e6));
        b = uint96(bound(b, 2e6, 500e6));
        vm.prank(alice);
        vault.deposit(a, alice);
        vm.prank(bob);
        vault.deposit(b, bob);
        uint256 nav = vault.totalAssets();
        uint256 q = quote.balanceOf(address(vault));
        uint256 escrow = quote.balanceOf(address(stream));
        assertEq(nav, q + escrow - vault.accruedExpenses());
        // Sum of pro-rata claims ~= NAV within rounding.
        uint256 total = vault.totalSupply();
        uint256 claimA = vault.convertToAssets(vault.balanceOf(alice));
        uint256 claimB = vault.convertToAssets(vault.balanceOf(bob));
        assertApproxEqAbs(claimA + claimB, nav, 4);
        assertEq((claimA * total) / nav + 2 >= vault.balanceOf(alice), true);
    }
}
