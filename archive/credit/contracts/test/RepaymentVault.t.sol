// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {RepaymentVault} from "../src/RepaymentVault.sol";
import {DemoToken} from "shared/DemoToken.sol";
import {FeeToken, CallbackToken} from "./CreditLine.t.sol";

contract RepaymentVaultTest is Test {
    CreditLine line;
    RepaymentVault vault;
    DemoToken col;
    DemoToken loan;
    AttestationRegistry registry;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address agent = makeAddr("agent");
    address agentB = makeAddr("agentB");

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new AttestationRegistry(address(this), address(this));
        col = new DemoToken("COL", "COL");
        loan = new DemoToken("USD", "USD");
        line = new CreditLine(registry, col, loan);
        vault = new RepaymentVault(loan, address(line));
        loan.mint(address(line), 1000e6);
        _borrowAndFund(alice);
        _borrowAndFund(bob);
    }

    function _borrowAndFund(address borrower) private {
        col.mint(borrower, 100e6);
        vm.startPrank(borrower);
        col.approve(address(line), 100e6);
        line.deposit(100e6);
        line.borrow(50e6);
        loan.approve(address(vault), type(uint256).max);
        vault.depositBudget(30e6);
        vm.stopPrank();
    }

    function _delegate(address borrower, address key, uint256 budget) private {
        vm.prank(borrower);
        vault.delegate(key, budget, uint64(block.timestamp + 30 days));
    }

    function testAgentPaysOnlyBoundBorrowerUsingLoanToken() public {
        _delegate(alice, agent, 20e6);
        vm.expectEmit(true, true, false, true, address(vault));
        emit RepaymentVault.RepaidOnBehalf(alice, agent, 10e6);
        vm.prank(agent);
        vault.repayOnBehalf(10e6);
        assertEq(line.borrowedOf(alice), 40e6);
        assertEq(line.borrowedOf(bob), 50e6);
        assertEq(line.borrowedOf(address(vault)), 0);
        assertEq(line.totalBorrowed(), 90e6);
        assertEq(vault.borrowerBalance(alice), 20e6);
        assertEq(vault.borrowerBalance(bob), 30e6);
        assertEq(vault.totalBudgetBalance(), 50e6);
        assertEq(loan.balanceOf(address(vault)), 50e6);
        assertEq(col.balanceOf(address(line)), 200e6);
    }

    function testCumulativeCapCannotBeBypassedBySplitting() public {
        _delegate(alice, agent, 20e6);
        vm.startPrank(agent);
        vault.repayOnBehalf(12e6);
        vault.repayOnBehalf(8e6);
        vm.expectRevert(RepaymentVault.BudgetExceeded.selector);
        vault.repayOnBehalf(1);
        vm.stopPrank();
        (, uint256 cap, uint256 spent,,) = vault.delegations(agent);
        assertEq(cap, spent);
        assertEq(line.borrowedOf(alice), 30e6);
    }

    function testOtherBorrowerCannotOverwriteOrRevokeKey() public {
        _delegate(alice, agent, 20e6);
        vm.startPrank(bob);
        vm.expectRevert(RepaymentVault.AgentKeyAlreadyAssigned.selector);
        vault.delegate(agent, 20e6, uint64(block.timestamp + 1 days));
        vm.expectRevert(RepaymentVault.NotYourDelegation.selector);
        vault.revoke(agent);
        vm.stopPrank();
        (address borrower,,,,) = vault.delegations(agent);
        assertEq(borrower, alice);
    }

    function testRevokeAndExplicitRenewal() public {
        _delegate(alice, agent, 20e6);
        vm.prank(agent);
        vault.repayOnBehalf(5e6);
        vm.prank(alice);
        vault.revoke(agent);
        vm.prank(agent);
        vm.expectRevert(RepaymentVault.NotAuthorized.selector);
        vault.repayOnBehalf(1);
        _delegate(alice, agent, 10e6);
        (, uint256 cap, uint256 spent,, bool revoked) = vault.delegations(agent);
        assertEq(cap, 10e6);
        assertEq(spent, 0);
        assertFalse(revoked);
    }

    function testExpiryBoundaryAndMissingDelegation() public {
        vm.prank(agent);
        vm.expectRevert(RepaymentVault.NotAuthorized.selector);
        vault.repayOnBehalf(1);
        _delegate(alice, agent, 20e6);
        vm.warp(block.timestamp + 30 days);
        vm.prank(agent);
        vm.expectRevert(RepaymentVault.NotAuthorized.selector);
        vault.repayOnBehalf(1);
        assertEq(vault.borrowerBalance(alice), 30e6);
    }

    function testWithdrawalNeverUsesAnotherBorrowersFunds() public {
        _delegate(alice, agent, 30e6);
        vm.prank(alice);
        vault.withdrawUnusedBudget(30e6);
        vm.prank(agent);
        vm.expectRevert(RepaymentVault.InsufficientBalance.selector);
        vault.repayOnBehalf(1);
        assertEq(vault.borrowerBalance(bob), 30e6);
        assertEq(loan.balanceOf(address(vault)), 30e6);
        vm.prank(alice);
        vm.expectRevert(RepaymentVault.InsufficientBalance.selector);
        vault.withdrawUnusedBudget(1);
    }

    function testMultipleAgentsShareOnlyTheirBorrowersBalance() public {
        _delegate(alice, agent, 30e6);
        _delegate(alice, agentB, 30e6);
        vm.prank(agent);
        vault.repayOnBehalf(30e6);
        vm.prank(agentB);
        vm.expectRevert(RepaymentVault.InsufficientBalance.selector);
        vault.repayOnBehalf(1);
        assertEq(vault.borrowerBalance(bob), 30e6);
    }

    function testOverpaymentRollsBackVaultCountersAndTransfers() public {
        _delegate(alice, agent, 30e6);
        loan.mint(address(this), 45e6);
        loan.approve(address(line), 45e6);
        line.repayFor(alice, 45e6);
        vm.prank(agent);
        vm.expectRevert(CreditLine.ExceedsDebt.selector);
        vault.repayOnBehalf(6e6);
        (,, uint256 spent,,) = vault.delegations(agent);
        assertEq(spent, 0);
        assertEq(vault.borrowerBalance(alice), 30e6);
        assertEq(vault.totalBudgetBalance(), 60e6);
        assertEq(loan.balanceOf(address(vault)), 60e6);
    }

    function testPermissionlessRepayForPullsOnlyPayersTokens() public {
        loan.mint(address(this), 10e6);
        loan.approve(address(line), 10e6);
        line.repayFor(alice, 10e6);
        assertEq(loan.balanceOf(address(this)), 0);
        assertEq(loan.balanceOf(alice), 20e6);
        assertEq(line.totalBorrowed(), 90e6);
        vm.expectRevert(CreditLine.ZeroAmount.selector);
        line.repayFor(alice, 0);
        vm.expectRevert(CreditLine.InvalidConfiguration.selector);
        line.repayFor(address(0), 1);
    }

    function testRejectInvalidConfigurationAndDelegations() public {
        vm.expectRevert(RepaymentVault.InvalidConfiguration.selector);
        new RepaymentVault(col, address(line));
        vm.expectRevert(RepaymentVault.InvalidConfiguration.selector);
        new RepaymentVault(loan, address(0));
        vm.startPrank(alice);
        vm.expectRevert(RepaymentVault.InvalidDelegation.selector);
        vault.delegate(address(0), 1, uint64(block.timestamp + 1));
        vm.expectRevert(RepaymentVault.InvalidDelegation.selector);
        vault.delegate(agent, 0, uint64(block.timestamp + 1));
        vm.expectRevert(RepaymentVault.InvalidDelegation.selector);
        vault.delegate(agent, 1, uint64(block.timestamp));
        vm.expectRevert(RepaymentVault.InsufficientBalance.selector);
        vault.delegate(agent, 30e6 + 1, uint64(block.timestamp + 1));
        vm.expectRevert(RepaymentVault.ZeroAmount.selector);
        vault.depositBudget(0);
        vm.expectRevert(RepaymentVault.ZeroAmount.selector);
        vault.withdrawUnusedBudget(0);
        vm.stopPrank();
    }

    function testFeeTokenDepositRevertsAtomically() public {
        FeeToken fee = new FeeToken();
        CreditLine otherLine = new CreditLine(registry, col, fee);
        RepaymentVault other = new RepaymentVault(fee, address(otherLine));
        fee.mint(address(this), 10e6);
        fee.approve(address(other), 10e6);
        vm.expectRevert(RepaymentVault.UnsupportedTokenTransfer.selector);
        other.depositBudget(10e6);
        assertEq(other.totalBudgetBalance(), 0);
        assertEq(fee.balanceOf(address(other)), 0);
    }

    function testFuzzRepaymentConservesBorrowerFunds(uint96 budget, uint96 payment) public {
        budget = uint96(bound(budget, 1, 30e6));
        payment = uint96(bound(payment, 1, budget));
        _delegate(alice, agent, budget);
        vm.prank(agent);
        vault.repayOnBehalf(payment);
        assertEq(line.borrowedOf(alice) + payment, 50e6);
        assertEq(vault.borrowerBalance(alice) + payment, 30e6);
        assertEq(vault.totalBudgetBalance(), loan.balanceOf(address(vault)));
        assertEq(vault.borrowerBalance(bob), 30e6);
    }
}
