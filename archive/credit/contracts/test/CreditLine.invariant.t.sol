// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {AttestationRegistry, DataSourceType, Tier} from "../src/AttestationRegistry.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {DemoToken} from "shared/DemoToken.sol";

contract CreditHandler is Test {
    CreditLine public line;
    AttestationRegistry public registry;
    DemoToken public collateral;
    DemoToken public loan;
    address[] public actors;
    uint256 public proofSequence;

    constructor(CreditLine line_, AttestationRegistry registry_, DemoToken col_, DemoToken loan_) {
        line = line_;
        registry = registry_;
        collateral = col_;
        loan = loan_;
        actors.push(address(0xA11CE));
        actors.push(address(0xB0B));
        actors.push(address(0xCAFE));
        for (uint256 i; i < actors.length; ++i) {
            vm.startPrank(actors[i]);
            collateral.approve(address(line), type(uint256).max);
            loan.approve(address(line), type(uint256).max);
            vm.stopPrank();
        }
    }

    function deposit(uint256 actorSeed, uint256 amount) external {
        address actor = actors[actorSeed % actors.length];
        amount = bound(amount, 1, 1000e6);
        collateral.mint(actor, amount);
        vm.prank(actor);
        line.deposit(amount);
    }

    function borrow(uint256 actorSeed, uint256 amount) external {
        address actor = actors[actorSeed % actors.length];
        uint256 available = line.availableToBorrow(actor);
        if (available == 0) return;
        amount = bound(amount, 1, available);
        vm.prank(actor);
        line.borrow(amount);
        assertLe(line.borrowedOf(actor), line.maxBorrow(actor));
    }

    function repay(uint256 actorSeed, uint256 amount) external {
        address actor = actors[actorSeed % actors.length];
        uint256 debt = line.borrowedOf(actor);
        if (debt == 0) return;
        amount = bound(amount, 1, debt);
        vm.prank(actor);
        line.repay(amount);
    }

    function withdraw(uint256 actorSeed, uint256 amount) external {
        address actor = actors[actorSeed % actors.length];
        uint256 held = line.collateralOf(actor);
        if (held == 0) return;
        amount = bound(amount, 1, held);
        if ((held - amount) * line.ltvBps(actor) / 10_000 < line.borrowedOf(actor)) return;
        vm.prank(actor);
        line.withdraw(amount);
    }

    function attest(uint256 actorSeed, uint8 tierSeed) external {
        registry.submitAttestation(
            actors[actorSeed % actors.length],
            DataSourceType.PAYMENT_PROCESSOR_REVENUE,
            Tier(1 + tierSeed % 3),
            uint64(block.timestamp + 1 days),
            bytes32(++proofSequence)
        );
    }

    function revoke(uint256 actorSeed) external {
        registry.revoke(actors[actorSeed % actors.length]);
    }

    function advanceTime(uint32 elapsed) external {
        vm.warp(block.timestamp + bound(elapsed, 1, 2 days));
    }
}

contract CreditLineInvariantTest is StdInvariant, Test {
    CreditLine line;
    CreditHandler handler;
    DemoToken collateral;
    DemoToken loan;

    function setUp() public {
        AttestationRegistry registry = new AttestationRegistry(address(this), address(this));
        collateral = new DemoToken("Collateral", "COL");
        loan = new DemoToken("Loan", "LOAN");
        line = new CreditLine(registry, collateral, loan);
        loan.mint(address(this), 1_000_000e6);
        loan.approve(address(line), type(uint256).max);
        line.fundLiquidity(1_000_000e6);
        handler = new CreditHandler(line, registry, collateral, loan);
        registry.rotateOracle(address(handler));
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = CreditHandler.deposit.selector;
        selectors[1] = CreditHandler.borrow.selector;
        selectors[2] = CreditHandler.repay.selector;
        selectors[3] = CreditHandler.withdraw.selector;
        selectors[4] = CreditHandler.attest.selector;
        selectors[5] = CreditHandler.revoke.selector;
        selectors[6] = CreditHandler.advanceTime.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function invariantCollateralAndDebtAccountingAreConserved() public view {
        uint256 deposits;
        uint256 debt;
        for (uint256 i; i < 3; ++i) {
            address actor = handler.actors(i);
            deposits += line.collateralOf(actor);
            debt += line.borrowedOf(actor);
            // Expired credentials may leave debt above current LTV; debt must still persist.
            assertEq(loan.balanceOf(actor), line.borrowedOf(actor));
        }
        assertEq(deposits, line.totalCollateral());
        assertEq(deposits, collateral.balanceOf(address(line)));
        assertEq(debt, line.totalBorrowed());
        assertEq(loan.balanceOf(address(line)) + debt, 1_000_000e6);
    }
}
