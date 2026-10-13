// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry, EligibilityReport, DataSourceType, Tier} from "../src/AttestationRegistry.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {EligibilityReceiver} from "../src/EligibilityReceiver.sol";
import {SimulationEligibilityReceiver} from "../src/mocks/SimulationEligibilityReceiver.sol";
import {DemoToken} from "shared/DemoToken.sol";

contract EligibilityTest is Test {
    AttestationRegistry registry;
    CreditLine line;
    EligibilityReceiver receiver;
    DemoToken collateral;
    DemoToken loan;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address forwarder = makeAddr("forwarder");
    bytes32 workflowId = keccak256("workflow");

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new AttestationRegistry(address(this), address(this));
        collateral = new DemoToken("Collateral", "COL");
        loan = new DemoToken("Loan", "USD");
        line = new CreditLine(registry, collateral, loan);
        registry.enableEvidenceMode(address(line));
        receiver = new EligibilityReceiver(registry, forwarder, workflowId, address(this));
        registry.rotateOracle(address(receiver));
        loan.mint(address(this), 1000e6);
        loan.approve(address(line), type(uint256).max);
        line.fundLiquidity(1000e6);
        collateral.mint(alice, 100e6);
        vm.startPrank(alice);
        collateral.approve(address(line), type(uint256).max);
        loan.approve(address(line), type(uint256).max);
        line.deposit(100e6);
        vm.stopPrank();
    }

    function report() internal view returns (EligibilityReport memory) {
        return EligibilityReport(
            alice,
            keccak256("account"),
            keccak256("proof"),
            keccak256("session"),
            registry.POLICY_VERSION(),
            Tier.TIER_2,
            uint64(block.timestamp),
            uint64(block.timestamp + 7 days),
            80e6
        );
    }

    function metadata() internal view returns (bytes memory) {
        return abi.encodePacked(workflowId, bytes10("proofline"), address(this), bytes2(uint16(1)));
    }

    function deliver(EligibilityReport memory r) internal {
        vm.prank(forwarder);
        receiver.onReport(metadata(), abi.encode(block.chainid, address(registry), r));
    }

    function testRealTokenTransfersAndCeiling() public {
        assertEq(line.maxBorrow(alice), 0);
        deliver(report());
        assertEq(line.maxBorrow(alice), 80e6);
        vm.prank(alice);
        line.borrow(80e6);
        assertEq(loan.balanceOf(alice), 80e6);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        vm.prank(alice);
        line.borrow(1);
    }

    function testRejectsReplayAcrossWallets() public {
        EligibilityReport memory r = report();
        deliver(r);
        r.subject = bob;
        vm.expectRevert(AttestationRegistry.ProofAlreadyUsed.selector);
        deliver(r);
    }

    function testFreshProofCannotDuplicateAccountAcrossWalletsEvenAfterRevocation() public {
        deliver(report());
        vm.prank(address(receiver));
        registry.revoke(alice);
        EligibilityReport memory r = report();
        r.subject = bob;
        r.proofHash = keccak256("new proof");
        r.sessionId = keccak256("new session");
        vm.expectRevert(AttestationRegistry.SourceAlreadyBound.selector);
        deliver(r);
    }

    function testSessionCannotBeReusedWithDifferentProof() public {
        deliver(report());
        EligibilityReport memory r = report();
        r.proofHash = keccak256("another proof");
        vm.expectRevert(AttestationRegistry.SessionAlreadyUsed.selector);
        deliver(r);
    }

    function testRejectsSourceStackingAndOutOfOrderObservations() public {
        deliver(report());
        EligibilityReport memory r = report();
        r.proofHash = keccak256("new proof");
        r.sessionId = keccak256("new session");
        vm.expectRevert(AttestationRegistry.InvalidEvidence.selector);
        deliver(r);
        r.sourceId = keccak256("other account");
        vm.expectRevert(AttestationRegistry.SourceAlreadyBound.selector);
        deliver(r);
    }

    function testRenewalReplacesRatherThanAddsAllowance() public {
        deliver(report());
        vm.prank(alice);
        line.borrow(60e6);
        vm.warp(block.timestamp + 1);
        EligibilityReport memory r = report();
        r.proofHash = keccak256("renewal");
        r.sessionId = keccak256("renewal session");
        deliver(r);
        assertEq(line.availableToBorrow(alice), 20e6);
        assertEq(line.borrowedOf(alice), 60e6);
    }

    function testExpiryBlocksNewBorrowButNotRepayment() public {
        EligibilityReport memory r = report();
        deliver(r);
        vm.prank(alice);
        line.borrow(10e6);
        vm.warp(r.expiresAt);
        assertEq(line.maxBorrow(alice), 0);
        assertEq(line.borrowedOf(alice), 10e6);
        vm.startPrank(alice);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        line.borrow(1);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        line.withdraw(1);
        line.repay(10e6);
        line.withdraw(100e6);
        vm.stopPrank();
    }

    function testMigrationRequiresBothWalletsAndMovesDebtAfterExpiry() public {
        EligibilityReport memory r = report();
        deliver(r);
        vm.prank(alice);
        line.borrow(80e6);
        vm.expectRevert(CreditLine.InvalidMigration.selector);
        vm.prank(bob);
        line.acceptMigration(alice);
        vm.prank(alice);
        line.requestMigration(bob);
        vm.warp(r.expiresAt);
        vm.prank(bob);
        line.acceptMigration(alice);
        assertEq(line.borrowedOf(bob), 80e6);
        assertEq(line.collateralOf(bob), 100e6);
        assertEq(line.borrowedOf(alice), 0);
        assertEq(line.totalBorrowed(), 80e6);
        assertEq(line.maxBorrow(bob), 0);
        assertEq(registry.sourceOwner(r.sourceId), bob);
        assertTrue(registry.retiredWallet(alice));
        r = report();
        r.proofHash = keccak256("new");
        r.sessionId = keccak256("new");
        vm.expectRevert(AttestationRegistry.InvalidEvidence.selector);
        deliver(r);
        r.subject = bob;
        deliver(r);
        assertEq(line.availableToBorrow(bob), 0);
    }

    function testMigrationCannotOverwriteExistingPositionAndCanBeCancelled() public {
        deliver(report());
        collateral.mint(bob, 1e6);
        vm.startPrank(bob);
        collateral.approve(address(line), 1e6);
        line.deposit(1e6);
        vm.stopPrank();
        vm.prank(alice);
        line.requestMigration(bob);
        vm.expectRevert(CreditLine.InvalidMigration.selector);
        vm.prank(bob);
        line.acceptMigration(alice);
        vm.prank(alice);
        line.requestMigration(address(0));
        assertEq(line.migrationRequested(alice), address(0));
    }

    function testForwarderWorkflowOwnerAndDestinationChecks() public {
        EligibilityReport memory r = report();
        bytes memory payload = abi.encode(block.chainid, address(registry), r);
        vm.expectRevert(EligibilityReceiver.UnauthorizedReport.selector);
        receiver.onReport(metadata(), payload);
        vm.startPrank(forwarder);
        vm.expectRevert(EligibilityReceiver.UnauthorizedReport.selector);
        receiver.onReport(abi.encodePacked(bytes32(0), bytes10("proofline"), address(this)), payload);
        vm.expectRevert(EligibilityReceiver.UnauthorizedReport.selector);
        receiver.onReport(abi.encodePacked(workflowId, bytes10("proofline"), bob), payload);
        vm.expectRevert(EligibilityReceiver.UnauthorizedReport.selector);
        receiver.onReport(hex"01", payload);
        vm.expectRevert(EligibilityReceiver.WrongDestination.selector);
        receiver.onReport(metadata(), abi.encode(block.chainid + 1, address(registry), r));
        vm.expectRevert(EligibilityReceiver.WrongDestination.selector);
        receiver.onReport(metadata(), abi.encode(block.chainid, bob, r));
        vm.stopPrank();
    }

    function testPolicyFreshnessAndCeilingCannotBeChanged() public {
        EligibilityReport memory r = report();
        r.policyVersion = keccak256("wrong");
        vm.expectRevert(AttestationRegistry.InvalidEvidence.selector);
        deliver(r);
        r = report();
        r.ceiling++;
        vm.expectRevert(AttestationRegistry.InvalidEvidence.selector);
        deliver(r);
        r = report();
        r.observedAt = uint64(block.timestamp + 1);
        vm.expectRevert(AttestationRegistry.InvalidExpiry.selector);
        deliver(r);
        r = report();
        r.observedAt = uint64(block.timestamp - 1 days - 1);
        vm.expectRevert(AttestationRegistry.InvalidExpiry.selector);
        deliver(r);
        r = report();
        r.expiresAt++;
        vm.expectRevert(AttestationRegistry.InvalidExpiry.selector);
        deliver(r);
    }

    function testLegacyEntryCannotBypassEvidenceMode() public {
        vm.expectRevert(AttestationRegistry.EvidenceRequired.selector);
        vm.prank(address(receiver));
        registry.submitAttestation(
            alice,
            DataSourceType.PAYMENT_PROCESSOR_REVENUE,
            Tier.TIER_3,
            uint64(block.timestamp + 1 days),
            keccak256("legacy")
        );
    }

    function testFuzzMigrationPreservesTotals(uint96 amount) public {
        uint256 debt = bound(amount, 1, 80e6);
        deliver(report());
        vm.startPrank(alice);
        line.borrow(debt);
        line.requestMigration(bob);
        vm.stopPrank();
        vm.prank(bob);
        line.acceptMigration(alice);
        assertEq(line.totalBorrowed(), debt);
        assertEq(line.borrowedOf(bob), debt);
        assertEq(line.totalCollateral(), 100e6);
    }

    function testSimulationRequiresExactOperatorApprovalAndConsumesIt() public {
        SimulationEligibilityReceiver sim = new SimulationEligibilityReceiver(registry, forwarder, address(this));
        registry.rotateOracle(address(sim));
        bytes memory payload = abi.encode(block.chainid, address(registry), report());
        bytes32 digest = keccak256(payload);
        vm.expectRevert(SimulationEligibilityReceiver.UnauthorizedReport.selector);
        vm.prank(bob);
        sim.approveReport(digest, true);
        vm.expectRevert(SimulationEligibilityReceiver.UnauthorizedReport.selector);
        vm.prank(forwarder);
        sim.onReport("", payload);
        sim.approveReport(digest, true);
        vm.expectRevert(SimulationEligibilityReceiver.UnauthorizedReport.selector);
        sim.onReport("", payload);
        EligibilityReport memory changed = report();
        changed.subject = bob;
        vm.expectRevert(SimulationEligibilityReceiver.UnauthorizedReport.selector);
        vm.prank(forwarder);
        sim.onReport("", abi.encode(block.chainid, address(registry), changed));
        vm.prank(forwarder);
        sim.onReport("", payload);
        assertEq(line.maxBorrow(alice), 80e6);
        assertFalse(sim.approvedReports(digest));
        vm.expectRevert(SimulationEligibilityReceiver.UnauthorizedReport.selector);
        vm.prank(forwarder);
        sim.onReport("", payload);
    }

    function testSimulationCannotDeployOnMainnet() public {
        vm.chainId(1);
        vm.expectRevert("test chains only");
        new SimulationEligibilityReceiver(registry, forwarder, address(this));
    }

    function testWorkflowPinIsRootOnlyOnceAndZeroDisablesDelivery() public {
        EligibilityReceiver pending = new EligibilityReceiver(registry, forwarder, bytes32(0), address(this));
        registry.rotateOracle(address(pending));
        bytes memory payload = abi.encode(block.chainid, address(registry), report());
        vm.expectRevert(EligibilityReceiver.UnauthorizedReport.selector);
        vm.prank(forwarder);
        pending.onReport(metadata(), payload);
        vm.expectRevert(EligibilityReceiver.UnauthorizedReport.selector);
        vm.prank(bob);
        pending.pinWorkflowId(workflowId);
        pending.pinWorkflowId(workflowId);
        vm.expectRevert(EligibilityReceiver.UnauthorizedReport.selector);
        pending.pinWorkflowId(keccak256("replacement"));
        vm.prank(forwarder);
        pending.onReport(metadata(), payload);
        assertEq(line.maxBorrow(alice), 80e6);
    }

    function testOtherCreditLineCannotReuseEligibilityAllowance() public {
        deliver(report());
        CreditLine another = new CreditLine(registry, collateral, loan);
        collateral.mint(bob, 100e6);
        vm.startPrank(bob);
        collateral.transfer(alice, 100e6);
        vm.stopPrank();
        vm.startPrank(alice);
        collateral.approve(address(another), 100e6);
        another.deposit(100e6);
        vm.stopPrank();
        vm.expectRevert(CreditLine.InvalidConfiguration.selector);
        another.maxBorrow(alice);
    }
}
