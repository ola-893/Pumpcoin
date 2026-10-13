// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AttestationRegistry, EligibilityReport, Tier} from "../src/AttestationRegistry.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {AgentCreditMandate} from "../src/AgentCreditMandate.sol";
import {DemoToken} from "shared/DemoToken.sol";
import {FeeToken, FailingToken} from "./CreditLine.t.sol";

contract AgentCreditMandateTest is Test {
    AttestationRegistry registry;
    CreditLine line;
    AgentCreditMandate mandate;
    DemoToken collateral;
    DemoToken loan;
    address human = makeAddr("human");
    Vm.Wallet agentW;
    address agent;
    Vm.Wallet secondW;
    address second;
    address other = makeAddr("other-human");
    address attacker = makeAddr("attacker");
    uint64 expiry;

    function setUp() public {
        vm.warp(1_800_000_000);
        expiry = uint64(block.timestamp + 1 days);
        agentW = vm.createWallet("independent-agent-key");
        agent = agentW.addr;
        secondW = vm.createWallet("second-agent");
        second = secondW.addr;
        registry = new AttestationRegistry(address(this), address(this));
        collateral = new DemoToken("Collateral", "pCOL");
        loan = new DemoToken("Loan", "pUSD");
        line = new CreditLine(registry, collateral, loan);
        mandate = new AgentCreditMandate(address(line), loan);
        line.pinAgentCreditMandate(address(mandate));
        registry.enableEvidenceMode(address(line));
        collateral.mint(human, 200e6);
        loan.mint(address(this), 1000e6);
        loan.approve(address(line), 1000e6);
        line.fundLiquidity(1000e6);
        vm.startPrank(human);
        collateral.approve(address(line), 200e6);
        line.deposit(200e6);
        vm.stopPrank();
        attest(human, Tier.TIER_2, expiry, 1);
    }

    function attest(address subject, Tier tier, uint64 expiresAt, uint256 nonce) internal {
        registry.submitEligibility(
            EligibilityReport({
                subject: subject,
                sourceId: keccak256(abi.encode(subject)),
                proofHash: bytes32(nonce),
                sessionId: bytes32(nonce),
                policyVersion: registry.POLICY_VERSION(),
                tier: tier,
                observedAt: uint64(block.timestamp),
                expiresAt: expiresAt,
                ceiling: tier == Tier.TIER_1 ? 50e6 : tier == Tier.TIER_2 ? 80e6 : 120e6
            })
        );
    }

    function signFor(
        AgentCreditMandate m,
        address human_,
        address agentKey,
        uint256 agentPk,
        uint256 nonce,
        uint64 enrollmentExpiry_
    ) internal view returns (bytes memory sig) {
        bytes32 inner = keccak256(abi.encode(block.chainid, address(m), human_, agentKey, nonce, enrollmentExpiry_));
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentPk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function grant(uint256 cap) internal {
        grantWith(mandate, human, agent, agentW.privateKey, cap, expiry, expiry);
    }

    function grantWith(
        AgentCreditMandate m,
        address human_,
        address agentKey,
        uint256 agentPk,
        uint256 cap,
        uint64 expiresAt_,
        uint64 enrollmentExpiry_
    ) internal {
        uint256 nonce = m.enrollmentNonce(agentKey);
        bytes memory sig = signFor(m, human_, agentKey, agentPk, nonce, enrollmentExpiry_);
        vm.prank(human_);
        m.grantMandate(agentKey, cap, expiresAt_, nonce, enrollmentExpiry_, sig);
    }

    function draw(uint256 amount) internal {
        vm.prank(agent);
        mandate.agentBorrow(amount);
    }

    function repay(uint256 amount) internal {
        vm.startPrank(agent);
        loan.approve(address(mandate), amount);
        mandate.agentRepay(amount);
        vm.stopPrank();
    }

    function testAgentOwnKeyReceivesFundsHumanKeepsAllDebtAndCollateral() public {
        grant(30e6);
        draw(20e6);
        assertEq(loan.balanceOf(agent), 20e6);
        assertEq(loan.balanceOf(human), 0);
        assertEq(loan.balanceOf(address(mandate)), 0);
        assertEq(line.borrowedOf(human), 20e6);
        assertEq(line.borrowedOf(agent), 0);
        assertEq(line.collateralOf(human), 200e6);
        repay(10e6);
        assertEq(line.borrowedOf(human), 10e6);
        assertEq(line.totalBorrowed(), 10e6);
        assertEq(loan.balanceOf(address(mandate)), 0);
    }

    function testUnrestrictedBorrowForCannotImposeHumanDebt() public {
        vm.prank(other);
        vm.expectRevert(CreditLine.NotMandate.selector);
        line.borrowFor(human, 10e6);
        vm.prank(agent);
        vm.expectRevert(CreditLine.NotMandate.selector);
        line.borrowFor(human, 10e6);
        assertEq(line.borrowedOf(human), 0);
    }

    function testNoGrantCannotBorrowOrRepay() public {
        vm.startPrank(agent);
        vm.expectRevert(AgentCreditMandate.NotAuthorized.selector);
        mandate.agentBorrow(1);
        vm.expectRevert(AgentCreditMandate.NotAuthorized.selector);
        mandate.agentRepay(1);
        vm.stopPrank();
    }

    function testAnotherHumanCannotOverwriteRevokeOrRenewAgentKey() public {
        grant(20e6);
        // Attacker holds no agent signature for its own human binding, so enrollment fails
        // before the owner check; the legitimate binding remains intact.
        vm.startPrank(other);
        uint256 nonce = mandate.enrollmentNonce(agent);
        bytes memory bad = signFor(mandate, other, agent, agentW.privateKey, nonce + 100, expiry);
        vm.expectRevert(AgentCreditMandate.InvalidEnrollment.selector);
        mandate.grantMandate(agent, 100e6, expiry, nonce + 100, expiry, bad);
        vm.expectRevert(AgentCreditMandate.NotYourMandate.selector);
        mandate.revokeMandate(agent);
        vm.stopPrank();
        // Even with a fresh agent signature for the attacker, the owner check still blocks takeover.
        uint256 nonce2 = mandate.enrollmentNonce(agent);
        bytes memory attackerSig = signFor(mandate, other, agent, agentW.privateKey, nonce2, expiry);
        vm.prank(other);
        vm.expectRevert(AgentCreditMandate.AgentKeyAlreadyAssigned.selector);
        mandate.grantMandate(agent, 100e6, expiry, nonce2, expiry, attackerSig);
        vm.prank(human);
        mandate.revokeMandate(agent);
        uint256 nonce3 = mandate.enrollmentNonce(agent);
        bytes memory attackerSig2 = signFor(mandate, other, agent, agentW.privateKey, nonce3, expiry);
        vm.prank(other);
        vm.expectRevert(AgentCreditMandate.AgentKeyAlreadyAssigned.selector);
        mandate.grantMandate(agent, 100e6, expiry, nonce3, expiry, attackerSig2);
        assertEq(mandate.mandateOwner(agent), human);
    }

    function testRepaymentNeverReplenishesCumulativeDrawCap() public {
        grant(20e6);
        draw(20e6);
        repay(20e6);
        (, uint256 drawn,,) = mandate.mandates(agent);
        assertEq(drawn, 20e6);
        vm.prank(agent);
        vm.expectRevert(AgentCreditMandate.DrawCapExceeded.selector);
        mandate.agentBorrow(1);
        assertEq(line.borrowedOf(human), 0);
    }

    function testExplicitHumanRenewalResetsOnlyNewMandateCounter() public {
        grant(20e6);
        draw(20e6);
        grantWith(mandate, human, agent, agentW.privateKey, 10e6, expiry, expiry);
        draw(10e6);
        assertEq(mandate.mandateVersion(agent), 2);
        assertEq(line.borrowedOf(human), 30e6);
        vm.prank(agent);
        vm.expectRevert(AgentCreditMandate.DrawCapExceeded.selector);
        mandate.agentBorrow(1);
    }

    function testHumanCeilingBindsEvenWhenMandateCapIsHigher() public {
        grant(1000e6);
        draw(80e6);
        vm.prank(agent);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        mandate.agentBorrow(1);
        (, uint256 drawn,,) = mandate.mandates(agent);
        assertEq(drawn, 80e6);
    }

    function testMultipleAgentKeysCannotStackHumanEligibility() public {
        grant(50e6);
        grantWith(mandate, human, second, secondW.privateKey, 50e6, expiry, expiry);
        draw(50e6);
        vm.prank(second);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        mandate.agentBorrow(31e6);
        vm.prank(second);
        mandate.agentBorrow(30e6);
        assertEq(line.borrowedOf(human), 80e6);
        assertEq(line.totalBorrowed(), 80e6);
    }

    function testFeeLoanDrawRollsBackBeforeAgentCanReceiveLess() public {
        FeeToken fee = new FeeToken();
        AttestationRegistry r = new AttestationRegistry(address(this), address(this));
        CreditLine l = new CreditLine(r, collateral, fee);
        AgentCreditMandate m = new AgentCreditMandate(address(l), fee);
        l.pinAgentCreditMandate(address(m));
        collateral.mint(human, 100e6);
        fee.mint(address(l), 100e6);
        vm.startPrank(human);
        collateral.approve(address(l), 100e6);
        l.deposit(100e6);
        vm.stopPrank();
        grantWith(m, human, agent, agentW.privateKey, 20e6, expiry, expiry);
        vm.prank(agent);
        vm.expectRevert(AgentCreditMandate.UnsupportedTokenTransfer.selector);
        m.agentBorrow(10e6);
        (, uint256 drawn,,) = m.mandates(agent);
        assertEq(drawn, 0);
        assertEq(l.borrowedOf(human), 0);
        assertEq(fee.balanceOf(address(l)), 100e6);
    }

    function testExpiredCredentialBlocksDrawButKeepsRepaymentOpen() public {
        grant(40e6);
        draw(20e6);
        vm.warp(expiry);
        // Renew agent consent after eligibility expires; it cannot renew the human's evidence.
        grantWith(mandate, human, agent, agentW.privateKey, 40e6, uint64(block.timestamp + 1 days), uint64(block.timestamp + 1 days));
        vm.prank(agent);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        mandate.agentBorrow(1);
        repay(20e6);
        assertEq(line.borrowedOf(human), 0);
    }

    function testExpiredMandateBlocksDrawButAllowsRepayment() public {
        grant(40e6);
        draw(20e6);
        vm.warp(expiry);
        vm.prank(agent);
        vm.expectRevert(AgentCreditMandate.NotAuthorized.selector);
        mandate.agentBorrow(1);
        repay(20e6);
        assertEq(line.borrowedOf(human), 0);
    }

    function testRevocationImmediatelyBlocksNewDrawWithoutTrappingRepayment() public {
        grant(40e6);
        draw(20e6);
        vm.prank(human);
        mandate.revokeMandate(agent);
        vm.prank(agent);
        vm.expectRevert(AgentCreditMandate.NotAuthorized.selector);
        mandate.agentBorrow(1);
        repay(20e6);
        assertEq(line.borrowedOf(human), 0);
        (, uint256 drawn,, bool revoked) = mandate.mandates(agent);
        assertTrue(revoked);
        assertEq(drawn, 20e6);
    }

    function testZeroAmountInvalidExpiryAndSelfAgentRejected() public {
        // Enrollment checks run after basic mandate validation; use a dummy signature
        // since these cases must fail on mandate fields first.
        bytes memory dummy = new bytes(65);
        vm.startPrank(human);
        vm.expectRevert(AgentCreditMandate.InvalidMandate.selector);
        mandate.grantMandate(address(0), 1, expiry, 0, expiry, dummy);
        vm.expectRevert(AgentCreditMandate.InvalidMandate.selector);
        mandate.grantMandate(human, 1, expiry, 0, expiry, dummy);
        vm.expectRevert(AgentCreditMandate.InvalidMandate.selector);
        mandate.grantMandate(agent, 0, expiry, 0, expiry, dummy);
        vm.expectRevert(AgentCreditMandate.InvalidMandate.selector);
        mandate.grantMandate(agent, 1, uint64(block.timestamp), 0, expiry, dummy);
        vm.stopPrank();
        grant(10e6);
        vm.startPrank(agent);
        vm.expectRevert(AgentCreditMandate.ZeroAmount.selector);
        mandate.agentBorrow(0);
        vm.expectRevert(AgentCreditMandate.ZeroAmount.selector);
        mandate.agentRepay(0);
        vm.stopPrank();
    }

    function testOverpaymentRollsBackTokensAndCounters() public {
        grant(20e6);
        draw(10e6);
        loan.mint(agent, 20e6);
        vm.startPrank(agent);
        loan.approve(address(mandate), 11e6);
        vm.expectRevert(CreditLine.ExceedsDebt.selector);
        mandate.agentRepay(11e6);
        vm.stopPrank();
        assertEq(loan.balanceOf(agent), 30e6);
        assertEq(loan.balanceOf(address(mandate)), 0);
        assertEq(line.borrowedOf(human), 10e6);
    }

    function testMigrationCannotLeaveOldMandateWithFreshCredit() public {
        grant(50e6);
        draw(20e6);
        vm.prank(human);
        line.requestMigration(other);
        vm.prank(other);
        line.acceptMigration(human);
        vm.prank(agent);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        mandate.agentBorrow(1);
        assertEq(line.borrowedOf(other), 20e6);
        assertEq(line.borrowedOf(human), 0);
    }

    function testPinIsRootOnlyOneTimeAndChecksWiring() public {
        CreditLine fresh = new CreditLine(registry, collateral, loan);
        AgentCreditMandate valid = new AgentCreditMandate(address(fresh), loan);
        vm.prank(other);
        vm.expectRevert(CreditLine.NotRoot.selector);
        fresh.pinAgentCreditMandate(address(valid));
        vm.expectRevert(CreditLine.InvalidConfiguration.selector);
        fresh.pinAgentCreditMandate(address(mandate));
        fresh.pinAgentCreditMandate(address(valid));
        vm.expectRevert(CreditLine.InvalidConfiguration.selector);
        fresh.pinAgentCreditMandate(address(valid));
        vm.expectRevert(AgentCreditMandate.InvalidConfiguration.selector);
        new AgentCreditMandate(address(fresh), collateral);
    }

    function testTransferFailureRollsBackHumanDebtAndDrawCounter() public {
        FailingToken bad = new FailingToken();
        AttestationRegistry r = new AttestationRegistry(address(this), address(this));
        CreditLine l = new CreditLine(r, collateral, bad);
        AgentCreditMandate m = new AgentCreditMandate(address(l), bad);
        l.pinAgentCreditMandate(address(m));
        collateral.mint(human, 100e6);
        vm.startPrank(human);
        collateral.approve(address(l), 100e6);
        l.deposit(100e6);
        vm.stopPrank();
        grantWith(m, human, agent, agentW.privateKey, 20e6, expiry, expiry);
        bad.mint(address(this), 100e6);
        bad.approve(address(l), 100e6);
        l.fundLiquidity(100e6);
        bad.setFail();
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(bad)));
        m.agentBorrow(10e6);
        (, uint256 drawn,,) = m.mandates(agent);
        assertEq(drawn, 0);
        assertEq(l.borrowedOf(human), 0);
    }

    function testFuzzCumulativeCapRemainsSpentAfterRepayment(uint96 amount) public {
        amount = uint96(bound(amount, 1, 80e6));
        grant(amount);
        draw(amount);
        repay(amount);
        (, uint256 drawn,,) = mandate.mandates(agent);
        assertEq(drawn, amount);
        assertEq(line.totalBorrowed(), 0);
        vm.prank(agent);
        vm.expectRevert(AgentCreditMandate.DrawCapExceeded.selector);
        mandate.agentBorrow(1);
    }

    // Regression 1a: first caller without agent consent cannot squat the key.
    function testSquatterWithoutAgentSignatureCannotClaimKey() public {
        uint256 nonce = mandate.enrollmentNonce(agent);
        // No signature at all.
        vm.prank(attacker);
        vm.expectRevert(AgentCreditMandate.InvalidEnrollment.selector);
        mandate.grantMandate(agent, 100e6, expiry, nonce, expiry, new bytes(65));
        // Signature bound to a different human does not authorize the attacker.
        bytes memory humanSig = signFor(mandate, human, agent, agentW.privateKey, nonce, expiry);
        vm.prank(attacker);
        vm.expectRevert(AgentCreditMandate.InvalidEnrollment.selector);
        mandate.grantMandate(agent, 100e6, expiry, nonce, expiry, humanSig);
        // Legitimate two-party enrollment still succeeds and blocks the squatter.
        vm.prank(human);
        mandate.grantMandate(agent, 20e6, expiry, nonce, expiry, humanSig);
        assertEq(mandate.mandateOwner(agent), human);
        assertEq(mandate.enrollmentNonce(agent), nonce + 1);
        uint256 nonce2 = mandate.enrollmentNonce(agent);
        bytes memory attackerSig = signFor(mandate, attacker, agent, agentW.privateKey, nonce2, expiry);
        vm.prank(attacker);
        vm.expectRevert(AgentCreditMandate.AgentKeyAlreadyAssigned.selector);
        mandate.grantMandate(agent, 100e6, expiry, nonce2, expiry, attackerSig);
    }

    // Regression 1b: squatter cannot win by front-running, and expiry does not free the key
    // for an unauthorized human; only the agent-authorized human can renew.
    function testFrontRunSquatterLosesAndExpiryDoesNotFreeKey() public {
        // Attacker front-runs with no valid agent consent: fails.
        uint256 nonce = mandate.enrollmentNonce(agent);
        bytes memory humanSig = signFor(mandate, human, agent, agentW.privateKey, nonce, expiry);
        vm.prank(attacker);
        vm.expectRevert(AgentCreditMandate.InvalidEnrollment.selector);
        mandate.grantMandate(agent, 50e6, expiry, nonce, expiry, humanSig);
        // Legitimate grant lands.
        vm.prank(human);
        mandate.grantMandate(agent, 20e6, expiry, nonce, expiry, humanSig);
        // After expiry, attacker still cannot claim even with its own fresh-looking request
        // unless the agent actually authorized the attacker (it did not).
        vm.warp(expiry + 1);
        uint256 nonce2 = mandate.enrollmentNonce(agent);
        bytes memory staleForAttacker = signFor(mandate, human, agent, agentW.privateKey, nonce2, uint64(block.timestamp + 1 days));
        vm.prank(attacker);
        vm.expectRevert(AgentCreditMandate.InvalidEnrollment.selector);
        mandate.grantMandate(agent, 50e6, uint64(block.timestamp + 1 days), nonce2, uint64(block.timestamp + 1 days), staleForAttacker);
        // Agent-authorized renewal by the same human succeeds with the next nonce.
        uint256 nonce3 = mandate.enrollmentNonce(agent);
        bytes memory renewSig = signFor(mandate, human, agent, agentW.privateKey, nonce3, uint64(block.timestamp + 1 days));
        vm.prank(human);
        mandate.grantMandate(agent, 15e6, uint64(block.timestamp + 1 days), nonce3, uint64(block.timestamp + 1 days), renewSig);
        assertEq(mandate.mandateOwner(agent), human);
        assertEq(mandate.mandateVersion(agent), 2);
    }

    // Regression 1c: enrollment is bound to human/contract/nonce/expiry.
    function testEnrollmentBindingRejectsWrongHumanContractNonceAndExpiry() public {
        uint256 nonce = mandate.enrollmentNonce(agent);
        bytes memory sig = signFor(mandate, human, agent, agentW.privateKey, nonce, expiry);
        // Wrong human.
        vm.prank(other);
        vm.expectRevert(AgentCreditMandate.InvalidEnrollment.selector);
        mandate.grantMandate(agent, 10e6, expiry, nonce, expiry, sig);
        // Wrong contract: same signature fails on a sibling mandate.
        CreditLine freshLine = new CreditLine(registry, collateral, loan);
        AgentCreditMandate sibling = new AgentCreditMandate(address(freshLine), loan);
        vm.prank(human);
        vm.expectRevert(AgentCreditMandate.InvalidEnrollment.selector);
        sibling.grantMandate(agent, 10e6, expiry, nonce, expiry, sig);
        // Wrong nonce.
        vm.prank(human);
        vm.expectRevert(AgentCreditMandate.InvalidEnrollment.selector);
        mandate.grantMandate(agent, 10e6, expiry, nonce + 1, expiry, sig);
        // Mandate expiry beyond agent-authorized enrollment expiry.
        vm.prank(human);
        vm.expectRevert(AgentCreditMandate.InvalidEnrollment.selector);
        mandate.grantMandate(agent, 10e6, uint64(uint256(expiry) + 1), nonce, expiry, sig);
        // Correct enrollment still works and consumes the nonce exactly once.
        vm.prank(human);
        mandate.grantMandate(agent, 10e6, expiry, nonce, expiry, sig);
        vm.prank(human);
        vm.expectRevert(AgentCreditMandate.InvalidEnrollment.selector);
        mandate.grantMandate(agent, 10e6, expiry, nonce, expiry, sig);
        assertEq(mandate.enrollmentNonce(agent), nonce + 1);
    }

    function testEnrollmentBindingRejectsWrongChain() public {
        uint256 nonce = mandate.enrollmentNonce(agent);
        uint256 otherChain = block.chainid + 1;
        bytes32 innerOther = keccak256(abi.encode(otherChain, address(mandate), human, agent, nonce, expiry));
        bytes32 digestOther = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", innerOther));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentW.privateKey, digestOther);
        bytes memory wrongChainSig = abi.encodePacked(r, s, v);
        vm.prank(human);
        vm.expectRevert(AgentCreditMandate.InvalidEnrollment.selector);
        mandate.grantMandate(agent, 10e6, expiry, nonce, expiry, wrongChainSig);
        assertEq(mandate.enrollmentNonce(agent), nonce);
    }

    // Regression 1d: renewal needs fresh agent authorization and preserves cumulative caps.
    function testRenewalRequiresFreshAuthorizationAndKeepsCumulativeCap() public {
        grant(20e6);
        draw(20e6);
        repay(20e6);
        uint256 nonce = mandate.enrollmentNonce(agent);
        // Stale nonce (already consumed) cannot renew.
        bytes memory stale = signFor(mandate, human, agent, agentW.privateKey, nonce - 1, expiry);
        vm.prank(human);
        vm.expectRevert(AgentCreditMandate.InvalidEnrollment.selector);
        mandate.grantMandate(agent, 10e6, expiry, nonce - 1, expiry, stale);
        // Fresh agent authorization renews with a new cumulative cap.
        grantWith(mandate, human, agent, agentW.privateKey, 10e6, expiry, expiry);
        (, uint256 drawn,,) = mandate.mandates(agent);
        assertEq(drawn, 0);
        draw(10e6);
        assertEq(line.borrowedOf(human), 10e6);
        vm.prank(agent);
        vm.expectRevert(AgentCreditMandate.DrawCapExceeded.selector);
        mandate.agentBorrow(1);
    }
}
