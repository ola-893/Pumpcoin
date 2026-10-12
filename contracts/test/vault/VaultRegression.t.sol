// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {VaultFixture} from "./VaultFixture.sol";
import {UnoraVault} from "../../src/vault/UnoraVault.sol";
import {ServiceExpenseStream} from "../../src/vault/ServiceExpenseStream.sol";
import {RestrictedSpotAdapter} from "../../src/vault/RestrictedSpotAdapter.sol";
import {MockSpotVenue} from "../../src/vault/MockSpotVenue.sol";
import {VaultValuationSource} from "../../src/vault/VaultValuationSource.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract VaultRegressionTest is VaultFixture {
    function cfg() internal view returns (UnoraVault.ConfigArgs memory) {
        return UnoraVault.ConfigArgs(
            address(adapter),
            address(venue),
            address(stream),
            address(source),
            vault.perTradeCap(),
            vault.maxPositionValue(),
            vault.expenseBudget(),
            vault.strategyHash(),
            vault.riskHash(),
            vault.identityRegistry(),
            vault.agentId()
        );
    }

    function depositA(uint256 amount) internal {
        vm.prank(alice);
        vault.deposit(amount, alice);
    }

    function advanceNotice() internal {
        vm.warp(block.timestamp + 1 days + 1);
        setPrice(1e18);
    }

    function testDustInEitherTokenDoesNotBlockBuysOrSells() public {
        depositA(1000e6);
        vm.startPrank(attacker);
        quote.transfer(address(adapter), 1);
        asset.mint(attacker, 1);
        asset.transfer(address(adapter), 1);
        vm.stopPrank();
        managerBuy(100e6, 100e6);
        managerSell(100e6, 100e6);
        assertEq(quote.balanceOf(address(adapter)), 1);
        assertEq(asset.balanceOf(address(adapter)), 1);
        assertEq(quote.balanceOf(address(vault)), 1000e6);
        assertEq(quote.allowance(address(adapter), address(venue)), 0);
        assertEq(asset.allowance(address(vault), address(adapter)), 0);
    }

    function testInsolventIssuanceFailsBeforeNewInvestorPays() public {
        depositA(10e6);
        vm.prank(admin);
        vault.accrueServiceExpense(20e6);
        assertEq(vault.maxDeposit(bob), 0);
        assertEq(vault.maxMint(bob), 0);
        uint256 beforeCash = quote.balanceOf(bob);
        vm.prank(bob);
        vm.expectRevert(UnoraVault.Insolvent.selector);
        vault.deposit(1000e6, bob);
        vm.prank(bob);
        vm.expectRevert(UnoraVault.Insolvent.selector);
        vault.mint(1, bob);
        assertEq(quote.balanceOf(bob), beforeCash);
        vm.prank(admin);
        vault.reverseAccrual(20e6);
        vm.prank(bob);
        uint256 shares = vault.deposit(1000e6, bob);
        assertApproxEqAbs(vault.previewRedeem(shares), 1000e6, 1);
    }

    function testZeroEquityWithOutstandingSharesRequiresExplicitRecovery() public {
        depositA(500e6);
        managerBuy(500e6, 500e6);
        setPrice(1);
        assertEq(vault.totalAssets(), 0);
        assertEq(vault.accruedExpenses(), 0);
        vm.prank(bob);
        vm.expectRevert(UnoraVault.Insolvent.selector);
        vault.deposit(100e6, bob);
        assertEq(vault.maxDeposit(bob), 0);
    }

    function testVenueNoticeChangesHashAndPeriodOnlyOnApply() public {
        depositA(1000e6);
        MockSpotVenue next = new MockSpotVenue(IERC20(address(quote)), IERC20(address(asset)), address(adapter));
        UnoraVault.ConfigArgs memory c = cfg();
        c.venue = address(next);
        bytes32 beforeHash = vault.currentConfigHash();
        uint256 beforePeriod = vault.periodId();
        vm.prank(admin);
        vault.proposeConfig(c);
        vm.prank(admin);
        vm.expectRevert(UnoraVault.ConfigNotReady.selector);
        vault.applyConfig();
        assertEq(adapter.allowedVenue(), address(venue));
        assertEq(vault.currentConfigHash(), beforeHash);
        advanceNotice();
        vm.prank(admin);
        vault.applyConfig();
        assertEq(adapter.allowedVenue(), address(next));
        assertNotEq(vault.currentConfigHash(), beforeHash);
        assertEq(vault.periodId(), beforePeriod + 1);
        vm.prank(admin);
        (bool ok,) = address(vault).call(abi.encodeWithSignature("relayAdapterVenue(address)", attacker));
        assertFalse(ok);
    }

    function testStreamReplacementCannotLoseEscrowOrLiabilities() public {
        depositA(1000e6);
        vm.prank(admin);
        bytes32 id = vault.fundServiceExpense(100e6, keccak256("data"), service, 1);
        ServiceExpenseStream next = new ServiceExpenseStream(IERC20(address(quote)), address(vault), admin);
        UnoraVault.ConfigArgs memory c = cfg();
        c.stream = address(next);
        vm.prank(admin);
        vault.proposeConfig(c);
        advanceNotice();
        vm.prank(admin);
        vm.expectRevert(UnoraVault.DanglingEscrow.selector);
        vault.applyConfig();
        assertEq(vault.totalAssets(), 1000e6);
        assertEq(address(vault.expenseStream()), address(stream));
        vm.prank(admin);
        vault.refundServiceExpense(id, 100e6, 1);
        vm.prank(admin);
        vault.accrueServiceExpense(1e6);
        vm.prank(admin);
        vm.expectRevert(UnoraVault.DanglingEscrow.selector);
        vault.applyConfig();
        vm.prank(admin);
        vault.reverseAccrual(1e6);
        bytes32 oldHash = vault.currentConfigHash();
        vm.prank(admin);
        vault.applyConfig();
        assertEq(vault.totalAssets(), 1000e6);
        assertNotEq(vault.currentConfigHash(), oldHash);
    }

    function testForeignStreamAdapterAndIdentityBindingsRejected() public {
        UnoraVault.ConfigArgs memory c = cfg();
        c.stream = address(new ServiceExpenseStream(IERC20(address(asset)), address(vault), admin));
        vm.prank(admin);
        vm.expectRevert(UnoraVault.BadBinding.selector);
        vault.proposeConfig(c);
        c = cfg();
        c.adapter = address(new RestrictedSpotAdapter(attacker, address(venue), address(quote), address(asset)));
        vm.prank(admin);
        vm.expectRevert(UnoraVault.BadBinding.selector);
        vault.proposeConfig(c);
        vm.prank(attacker);
        uint256 alien = registry.register();
        c = cfg();
        c.agentId = alien;
        vm.prank(admin);
        vm.expectRevert(UnoraVault.BadBinding.selector);
        vault.proposeConfig(c);
    }

    function testIdentityOwnerRecheckedAfterNotice() public {
        UnoraVault.ConfigArgs memory c = cfg();
        vm.prank(admin);
        vault.proposeConfig(c);
        vm.prank(manager);
        registry.transfer(agentId, attacker);
        advanceNotice();
        vm.prank(admin);
        vm.expectRevert(UnoraVault.BadBinding.selector);
        vault.applyConfig();
        assertEq(vault.manager(), manager);
    }

    function testStaleEmergencyRotationIsUnvaluedAndPreservesBalances() public {
        depositA(1000e6);
        uint256 id = vault.periodId();
        bytes32 h = vault.currentConfigHash();
        vm.warp(block.timestamp + 2 hours);
        vm.prank(admin);
        vault.rotateManager(attacker, STRAT_V1, RISK_V1);
        assertFalse(vault.periodEndValued(id));
        assertFalse(vault.periodStartValued(id + 1));
        assertTrue(vault.periodNeedsRecovery(id));
        assertEq(vault.periodEndReason(id), source.REASON_STALE());
        assertEq(quote.balanceOf(address(vault)), 1000e6);
        assertNotEq(vault.currentConfigHash(), h);
        vm.prank(manager);
        vm.expectRevert(UnoraVault.NotManager.selector);
        vault.managerTrade(address(quote), address(asset), 1, 1, block.timestamp + 1, address(venue));
        setPrice(1e18);
        vm.prank(admin);
        vault.rotateManager(manager, STRAT_V1, RISK_V1);
        assertTrue(vault.periodStartValued(id + 2));
        assertTrue(vault.periodNeedsRecovery(id + 1));
    }

    function testEmergencyKeyRotationCannotChangeStrategyWithoutNotice() public {
        vm.prank(admin);
        vm.expectRevert(UnoraVault.StrategyChangeRequiresNotice.selector);
        vault.rotateManager(attacker, bytes32("evil"), RISK_V1);
        assertEq(vault.manager(), manager);
    }

    function testSellUsesQuoteNotionalAndAllowsPartialRiskReduction() public {
        depositA(1000e6);
        managerBuy(500e6, 500e6);
        setPrice(2e18);
        vm.prank(manager);
        vm.expectRevert(UnoraVault.ExceedsPerTradeCap.selector);
        vault.managerTrade(address(asset), address(quote), 300e6, 300e6, block.timestamp + 100, address(venue));
        managerSell(50e6, 50e6);
        assertEq(source.markedValue(asset.balanceOf(address(vault))), 900e6);
        managerSell(50e6, 50e6);
        assertEq(source.markedValue(asset.balanceOf(address(vault))), 800e6);
    }

    function testObligationNoncesAndScopeCannotBeSubstituted() public {
        depositA(1000e6);
        vm.startPrank(admin);
        bytes32 id = vault.fundServiceExpense(50e6, keccak256("data"), service, 7);
        vm.expectRevert(ServiceExpenseStream.Replay.selector);
        vault.fundServiceExpense(20e6, keccak256("other"), service, 7);
        vault.accrueServiceExpense(30e6);
        vault.settleServiceExpense(id, 10e6, 42);
        vm.expectRevert(ServiceExpenseStream.Replay.selector);
        vault.settleServiceExpense(id, 20e6, 42);
        vault.settleServiceExpense(id, 20e6, 43);
        vm.expectRevert(ServiceExpenseStream.UnknownObligation.selector);
        vault.refundServiceExpense(bytes32("fake"), 1e6, 1);
        vm.expectRevert(ServiceExpenseStream.Overdraw.selector);
        vault.refundServiceExpense(id, 21e6, 1);
        vault.refundServiceExpense(id, 20e6, 1);
        vm.stopPrank();
        assertEq(quote.balanceOf(service), 30e6);
        assertEq(vault.totalAssets(), 970e6);
        assertEq(stream.obligationRemaining(id), 0);
    }

    function testUnsolicitedEscrowTokensCannotInflateNAVOrBlockReplacement() public {
        depositA(1000e6);
        vm.prank(attacker);
        quote.transfer(address(stream), 100e6);
        assertEq(vault.totalAssets(), 1000e6);
        assertEq(stream.escrowBalance(), 0);
        ServiceExpenseStream next = new ServiceExpenseStream(IERC20(address(quote)), address(vault), admin);
        UnoraVault.ConfigArgs memory c = cfg();
        c.stream = address(next);
        vm.prank(admin);
        vault.proposeConfig(c);
        advanceNotice();
        vm.prank(admin);
        vault.applyConfig();
        assertEq(vault.totalAssets(), 1000e6);
        assertEq(quote.balanceOf(address(stream)), 100e6);
    }
}
