// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AttestationRegistry, DataSourceType, Tier} from "../src/AttestationRegistry.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {DemoToken} from "shared/DemoToken.sol";

contract EighteenDecimalToken is ERC20 {
    constructor() ERC20("18 decimals", "D18") {}
}

contract CallbackToken is DemoToken {
    address public callbackTarget;
    bool public callbackSucceeded;
    bytes public callbackError;
    constructor() DemoToken("Callback", "CB") {}

    function arm(address target) external {
        callbackTarget = target;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (callbackTarget != address(0)) {
            (callbackSucceeded, callbackError) =
                callbackTarget.call(abi.encodeWithSignature("withdraw(uint256)", 1));
        }
        return super.transferFrom(from, to, amount);
    }
}

contract FeeToken is DemoToken {
    constructor() DemoToken("Fee", "FEE") {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && value >= 100) {
            super._update(from, address(0), value / 100);
            value -= value / 100;
        }
        super._update(from, to, value);
    }
}

contract FailingToken is DemoToken {
    bool public fail;
    constructor() DemoToken("Failing", "FAIL") {}

    function setFail() external {
        fail = true;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (fail) return false;
        return super.transfer(to, amount);
    }
}

contract CreditLineTest is Test {
    AttestationRegistry registry;
    CreditLine line;
    DemoToken collateral;
    DemoToken loan;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    DataSourceType constant SOURCE = DataSourceType.PAYMENT_PROCESSOR_REVENUE;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new AttestationRegistry(address(this), address(this));
        collateral = new DemoToken("Demo collateral", "DCOL");
        loan = new DemoToken("Demo dollar", "DUSD");
        line = new CreditLine(registry, collateral, loan);
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

    function attest(Tier tier) internal {
        registry.submitAttestation(alice, SOURCE, tier, uint64(block.timestamp + 1 days), bytes32(uint256(1)));
    }

    function testBaseThenBoostedLimitWithRealTransfers() public {
        assertEq(line.maxBorrow(alice), 50e6);
        vm.startPrank(alice);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        line.borrow(50e6 + 1);
        line.borrow(50e6);
        vm.stopPrank();
        attest(Tier.TIER_2);
        assertEq(line.maxBorrow(alice), 80e6);
        assertEq(line.availableToBorrow(alice), 30e6);
        vm.startPrank(alice);
        line.borrow(30e6);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        line.borrow(1);
        vm.stopPrank();
        assertEq(loan.balanceOf(alice), 80e6);
        assertEq(line.borrowedOf(alice), 80e6);
        assertEq(collateral.balanceOf(address(line)), 100e6);
        assertEq(line.totalBorrowed(), 80e6);
    }

    function testTierOneWrongSourceAndOtherWalletDoNotBoost() public {
        attest(Tier.TIER_1);
        assertEq(line.maxBorrow(alice), 50e6);
        registry.submitAttestation(
            alice,
            DataSourceType.GIG_PLATFORM_EARNINGS,
            Tier.TIER_3,
            uint64(block.timestamp + 1 days),
            bytes32(uint256(2))
        );
        assertEq(line.maxBorrow(alice), 50e6);
        registry.submitAttestation(
            bob, SOURCE, Tier.TIER_3, uint64(block.timestamp + 1 days), bytes32(uint256(3))
        );
        assertEq(line.maxBorrow(alice), 50e6);
        assertEq(line.maxBorrow(bob), 0);
        vm.prank(bob);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        line.borrow(1);
    }

    function testExpiryPreservesDebtAndAllowsRepayment() public {
        attest(Tier.TIER_2);
        vm.prank(alice);
        line.borrow(80e6);
        vm.warp(block.timestamp + 1 days);
        assertEq(line.maxBorrow(alice), 50e6);
        assertEq(line.availableToBorrow(alice), 0);
        assertEq(line.borrowedOf(alice), 80e6);
        vm.startPrank(alice);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        line.borrow(1);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        line.withdraw(1);
        line.repay(80e6);
        line.withdraw(100e6);
        vm.stopPrank();
        assertEq(line.totalBorrowed(), 0);
        assertEq(line.totalCollateral(), 0);
        assertEq(collateral.balanceOf(alice), 100e6);
    }

    function testRevocationAndDowngradeRemoveBoostWithoutErasingDebt() public {
        attest(Tier.TIER_3);
        vm.prank(alice);
        line.borrow(80e6);
        registry.submitAttestation(
            alice, SOURCE, Tier.TIER_1, uint64(block.timestamp + 1 days), bytes32(uint256(2))
        );
        assertEq(line.availableToBorrow(alice), 0);
        registry.revoke(alice);
        assertEq(line.maxBorrow(alice), 50e6);
        assertEq(line.borrowedOf(alice), 80e6);
    }

    function testWithdrawalCannotUndercollateralize() public {
        vm.startPrank(alice);
        line.borrow(25e6);
        vm.expectRevert(CreditLine.ExceedsLimit.selector);
        line.withdraw(50e6 + 1);
        line.withdraw(50e6);
        assertEq(line.collateralOf(alice), 50e6);
        line.repay(10e6);
        assertEq(line.availableToBorrow(alice), 10e6);
        vm.stopPrank();
    }

    function testZeroAndOverpaymentRevertWithoutChangingBalances() public {
        vm.startPrank(alice);
        vm.expectRevert(CreditLine.ZeroAmount.selector);
        line.deposit(0);
        vm.expectRevert(CreditLine.ZeroAmount.selector);
        line.borrow(0);
        vm.expectRevert(CreditLine.ZeroAmount.selector);
        line.repay(0);
        vm.expectRevert(CreditLine.ZeroAmount.selector);
        line.withdraw(0);
        vm.expectRevert(CreditLine.ZeroAmount.selector);
        line.fundLiquidity(0);
        vm.expectRevert(CreditLine.ExceedsDebt.selector);
        line.repay(1);
        vm.expectRevert(CreditLine.InsufficientCollateral.selector);
        line.withdraw(100e6 + 1);
        vm.stopPrank();
        assertEq(line.collateralOf(alice), 100e6);
        assertEq(line.totalBorrowed(), 0);
    }

    function testNoLiquidityDoesNotSpendCollateral() public {
        CreditLine empty = new CreditLine(registry, collateral, loan);
        collateral.mint(alice, 100e6);
        vm.startPrank(alice);
        collateral.approve(address(empty), 100e6);
        empty.deposit(100e6);
        vm.expectRevert(CreditLine.InsufficientLiquidity.selector);
        empty.borrow(1);
        vm.stopPrank();
        assertEq(empty.borrowedOf(alice), 0);
        assertEq(collateral.balanceOf(address(empty)), 100e6);
        assertEq(empty.availableToBorrow(alice), 0);
    }

    function testRejectsFeeOnTransferCollateral() public {
        FeeToken fee = new FeeToken();
        CreditLine other = new CreditLine(registry, fee, loan);
        fee.mint(address(this), 100e6);
        fee.approve(address(other), 100e6);
        vm.expectRevert(CreditLine.UnsupportedTokenTransfer.selector);
        other.deposit(100e6);
        assertEq(other.totalCollateral(), 0);
        assertEq(fee.balanceOf(address(other)), 0);
    }

    function testOutgoingTransferFailureRollsBackDebt() public {
        FailingToken badLoan = new FailingToken();
        CreditLine other = new CreditLine(registry, collateral, badLoan);
        collateral.mint(address(this), 100e6);
        collateral.approve(address(other), 100e6);
        other.deposit(100e6);
        badLoan.mint(address(this), 100e6);
        badLoan.approve(address(other), 100e6);
        other.fundLiquidity(100e6);
        badLoan.setFail();
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(badLoan)));
        other.borrow(50e6);
        assertEq(other.totalBorrowed(), 0);
        assertEq(other.borrowedOf(address(this)), 0);
    }

    function testRejectsInvalidConfiguration() public {
        vm.expectRevert(CreditLine.InvalidConfiguration.selector);
        new CreditLine(registry, collateral, collateral);
        vm.expectRevert(CreditLine.InvalidConfiguration.selector);
        new CreditLine(AttestationRegistry(address(0)), collateral, loan);
        vm.expectRevert(CreditLine.InvalidConfiguration.selector);
        new CreditLine(registry, IERC20(address(0)), loan);
        ERC20 differentDecimals = new EighteenDecimalToken();
        vm.expectRevert(CreditLine.InvalidConfiguration.selector);
        new CreditLine(registry, collateral, differentDecimals);
    }

    function testTokenCallbackCannotReenter() public {
        CallbackToken callback = new CallbackToken();
        CreditLine other = new CreditLine(registry, callback, loan);
        callback.mint(address(this), 100e6);
        callback.approve(address(other), 100e6);
        callback.arm(address(other));
        other.deposit(100e6);
        assertFalse(callback.callbackSucceeded());
        assertEq(bytes4(callback.callbackError()), bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        assertEq(other.totalCollateral(), 100e6);
    }

    function testFuzzRoundingNeverExceedsLtv(uint128 amount) public {
        amount = uint128(bound(amount, 1, type(uint96).max));
        collateral.mint(bob, amount);
        vm.startPrank(bob);
        collateral.approve(address(line), amount);
        line.deposit(amount);
        vm.stopPrank();
        assertEq(line.maxBorrow(bob), uint256(amount) / 2);
        registry.submitAttestation(
            bob, SOURCE, Tier.TIER_3, uint64(block.timestamp + 1 days), bytes32(uint256(1))
        );
        uint256 limit = line.maxBorrow(bob);
        assertLe(limit * 10_000, uint256(amount) * 8000);
        assertGt((limit + 1) * 10_000, uint256(amount) * 8000);
    }
}
