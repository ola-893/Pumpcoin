// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {AgentCreditMandate} from "../src/AgentCreditMandate.sol";
import {DemoToken} from "shared/DemoToken.sol";
import {CreditBatcher} from "../src/mocks/CreditBatcher.sol";

/// @notice Documents the exact multi-action log sequences that the
/// offchain reconciler consumes: batched and mixed credit-line actions emit
/// one log group per action inside a single transaction.
contract BatchedRepaymentTest is Test {
    AttestationRegistry registry;
    CreditLine line;
    DemoToken collateral;
    DemoToken loan;
    CreditBatcher batcher;
    address human = makeAddr("human");

    bytes32 constant BORROWED = keccak256("Borrowed(address,uint256)");
    bytes32 constant BORROWED_FOR = keccak256("BorrowedFor(address,address,uint256)");
    bytes32 constant REPAID = keccak256("Repaid(address,uint256)");
    bytes32 constant REPAID_FOR = keccak256("RepaidFor(address,address,uint256)");

    function setUp() public {
        registry = new AttestationRegistry(address(this), address(this));
        collateral = new DemoToken("Demo collateral", "DCOL");
        loan = new DemoToken("Demo dollar", "DUSD");
        line = new CreditLine(registry, collateral, loan);
        batcher = new CreditBatcher();
        loan.mint(address(this), 1000e6);
        loan.approve(address(line), type(uint256).max);
        line.fundLiquidity(1000e6);
        collateral.mint(human, 200e6);
        vm.startPrank(human);
        collateral.approve(address(line), 200e6);
        line.deposit(200e6);
        vm.stopPrank();
        collateral.mint(address(batcher), 200e6);
        loan.mint(address(batcher), 100e6);
        batcher.fund(address(collateral), address(loan), address(line), 200e6);
    }

    function lineLogs(Vm.Log[] memory logs) internal view returns (Vm.Log[] memory) {
        uint256 count;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(line)) count++;
        }
        Vm.Log[] memory out = new Vm.Log[](count);
        uint256 j;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(line)) {
                out[j] = logs[i];
                j++;
            }
        }
        return out;
    }

    function testMixedRepayBorrowRepayEmitsFourLogsInOrder() public {
        vm.prank(human);
        line.borrow(40e6);
        vm.recordLogs();
        batcher.repayForBorrowRepay(address(line), human, 15e6, 30e6, 10e6);
        Vm.Log[] memory logs = lineLogs(vm.getRecordedLogs());
        assertEq(logs.length, 4);
        assertEq(logs[0].topics[0], REPAID);
        assertEq(abi.decode(logs[0].data, (uint256)), 15e6);
        assertEq(logs[1].topics[0], REPAID_FOR);
        assertEq(abi.decode(logs[1].data, (uint256)), 15e6);
        assertEq(logs[2].topics[0], BORROWED);
        assertEq(abi.decode(logs[2].data, (uint256)), 30e6);
        assertEq(logs[3].topics[0], REPAID);
        assertEq(abi.decode(logs[3].data, (uint256)), 10e6);
        assertEq(line.borrowedOf(human), 25e6);
        assertEq(line.borrowedOf(address(batcher)), 20e6);
    }

    function testDoubleRepayForEmitsTwoPairsForDistinctBorrowers() public {
        vm.prank(human);
        line.borrow(40e6);
        vm.prank(address(batcher));
        line.borrow(30e6);
        vm.recordLogs();
        batcher.repayForTwice(address(line), human, 5e6, address(batcher), 5e6);
        Vm.Log[] memory logs = lineLogs(vm.getRecordedLogs());
        assertEq(logs.length, 4);
        assertEq(logs[0].topics[0], REPAID);
        assertEq(abi.decode(logs[0].data, (uint256)), 5e6);
        assertEq(logs[1].topics[0], REPAID_FOR);
        assertEq(logs[2].topics[0], REPAID);
        assertEq(abi.decode(logs[2].data, (uint256)), 5e6);
        assertEq(logs[3].topics[0], REPAID_FOR);
        assertEq(line.borrowedOf(human), 35e6);
        assertEq(line.borrowedOf(address(batcher)), 25e6);
    }

    /// @notice Equal amounts, multiple actors: a direct borrow by the agent
    /// key against its own position next to a mandate borrow for H. Debts
    /// stay separate (A owes 10, H owes 10) and the log sequence carries one
    /// complete triple — the offchain group the reconciler must match.
    function testEqualAmountDirectAndMandateBorrowKeepSeparateDebts() public {
        AgentCreditMandate mandate = new AgentCreditMandate(address(line), loan);
        line.pinAgentCreditMandate(address(mandate));
        Vm.Wallet memory agentW = vm.createWallet("equal-amount-agent");
        collateral.mint(agentW.addr, 200e6);
        vm.startPrank(agentW.addr);
        collateral.approve(address(line), 200e6);
        line.deposit(200e6);
        vm.stopPrank();
        collateral.mint(human, 200e6);
        vm.startPrank(human);
        collateral.approve(address(line), 200e6);
        line.deposit(200e6);
        vm.stopPrank();
        uint64 expiry = uint64(block.timestamp + 1 days);
        uint256 nonce = mandate.enrollmentNonce(agentW.addr);
        bytes32 inner = keccak256(abi.encode(block.chainid, address(mandate), human, agentW.addr, nonce, expiry));
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentW.privateKey, digest);
        vm.prank(human);
        mandate.grantMandate(agentW.addr, 100e6, expiry, nonce, expiry, abi.encodePacked(r, s, v));
        vm.recordLogs();
        vm.prank(agentW.addr);
        line.borrow(10e6);
        vm.prank(agentW.addr);
        mandate.agentBorrow(10e6);
        Vm.Log[] memory logs = lineLogs(vm.getRecordedLogs());
        assertEq(logs.length, 3);
        assertEq(logs[0].topics[0], BORROWED);
        assertEq(abi.decode(logs[0].data, (uint256)), 10e6);
        assertEq(logs[1].topics[0], BORROWED);
        assertEq(logs[2].topics[0], BORROWED_FOR);
        assertEq(line.borrowedOf(agentW.addr), 10e6);
        assertEq(line.borrowedOf(human), 10e6);
    }
}
