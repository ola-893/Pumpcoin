// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    PumpCoinRegisteredVaultTest,
    RegistrationTokenFixture,
    RegistrationRegistryFixture
} from "./PumpCoinRegisteredVault.t.sol";
import {PumpCoinRegisteredVault} from "../../src/vault/PumpCoinRegisteredVault.sol";
import {UnoraVault} from "../../src/vault/UnoraVault.sol";
import {RestrictedSpotAdapter} from "../../src/vault/RestrictedSpotAdapter.sol";
import {PythVaultValuationSource, IVaultPyth} from "../../src/vault/PythVaultValuationSource.sol";
import {UniswapV4VaultVenue, IV4Manager} from "../../src/vault/UniswapV4VaultVenue.sol";
import {VaultInvestorGateway} from "../../src/vault/VaultInvestorGateway.sol";

contract TradingPythFixture is IVaultPyth {
    mapping(bytes32 => Price) internal prices;

    function set(bytes32 id, int64 value, uint64 conf, int32 expo, uint256 at) external {
        prices[id] = Price(value, conf, expo, at);
    }

    function getPriceUnsafe(bytes32 id) external view returns (Price memory) {
        return prices[id];
    }
}

interface ITradingCallback {
    function unlockCallback(bytes calldata) external returns (bytes memory);
}

contract TradingRouterFixture is IV4Manager {
    address public caller;
    uint256 public mark = 2e6;
    uint256 public haircut;
    bool public lie;
    bool public partialFill;
    address internal input;
    uint256 internal beforeInput;
    uint256 internal due;

    function setHaircut(uint256 v) external {
        haircut = v;
    }

    function setLie(bool v) external {
        lie = v;
    }

    function setPartial(bool v) external {
        partialFill = v;
    }

    function unlock(bytes calldata data) external returns (bytes memory) {
        require(caller == address(0), "locked");
        caller = msg.sender;
        bytes memory result = ITradingCallback(msg.sender).unlockCallback(data);
        caller = address(0);
        return result;
    }

    function swap(PoolKey calldata, SwapParams calldata p, bytes calldata) external returns (int256 delta) {
        require(msg.sender == caller, "callback");
        uint256 amount = uint256(-p.amountSpecified);
        if (partialFill) amount--;
        due = amount;
        uint256 out = p.zeroForOne ? amount * 1e18 / mark : amount * mark / 1e18;
        out = out * (10000 - haircut) / 10000;
        int128 d0 = p.zeroForOne ? -int128(int256(amount)) : int128(int256(out));
        int128 d1 = p.zeroForOne ? int128(int256(out)) : -int128(int256(amount));
        delta = (int256(d0) << 128) | int256(uint256(uint128(d1)));
    }

    function sync(address currency) external {
        require(msg.sender == caller, "sync");
        input = currency;
        beforeInput = IERC20(currency).balanceOf(address(this));
    }

    function settle() external payable returns (uint256 paid) {
        require(msg.sender == caller, "settle");
        paid = IERC20(input).balanceOf(address(this)) - beforeInput;
        require(paid == due, "paid");
    }

    function take(address currency, address to, uint256 amount) external {
        require(msg.sender == caller, "take");
        RegistrationTokenFixture(currency).mint(to, lie ? amount - 1 : amount);
    }
}

contract VaultTradingIntegrationTest is Test {
    TradingPythFixture pyth;
    PythVaultValuationSource source;
    TradingRouterFixture router;
    RegistrationTokenFixture quote;
    RegistrationTokenFixture position;
    PumpCoinRegisteredVault vault;
    RestrictedSpotAdapter adapter;
    UniswapV4VaultVenue venue;
    VaultInvestorGateway gateway;
    bytes32 constant MON = keccak256("MON");
    bytes32 constant USD = keccak256("USDC");
    address controller = makeAddr("controller");
    address manager = makeAddr("manager");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function fresh() internal {
        pyth.set(MON, 200000000, 1000, -8, block.timestamp);
        pyth.set(USD, 100000000, 1000, -8, block.timestamp);
    }

    function setUp() public {
        vm.warp(1800000000);
        pyth = new TradingPythFixture();
        fresh();
        source = new PythVaultValuationSource(address(pyth), MON, USD, 300, 100);
        RegistrationTokenFixture q = new RegistrationTokenFixture(6);
        RegistrationTokenFixture p = new RegistrationTokenFixture(18);
        vm.etch(address(0x1000), address(q).code);
        vm.etch(address(0x2000), address(p).code);
        quote = RegistrationTokenFixture(address(0x1000));
        position = RegistrationTokenFixture(address(0x2000));
        RegistrationRegistryFixture registry = new RegistrationRegistryFixture();
        vm.prank(controller);
        vault = new PumpCoinRegisteredVault(
            PumpCoinRegisteredVault.Registration(
                IERC20(address(quote)),
                IERC20(address(position)),
                controller,
                manager,
                keccak256("strategy"),
                keccak256("risk"),
                10e6,
                50e6,
                address(registry),
                "data:application/json;base64,e30=",
                keccak256("manifest")
            )
        );
        adapter = new RestrictedSpotAdapter(address(vault), address(0), address(quote), address(position));
        router = new TradingRouterFixture();
        venue = new UniswapV4VaultVenue(address(adapter), address(router), address(source), 3000, 60, 100);
        gateway = new VaultInvestorGateway(address(vault));
        vm.startPrank(controller);
        vault.proposeConfig(
            UnoraVault.ConfigArgs(
                address(adapter),
                address(venue),
                address(0),
                address(source),
                10e6,
                50e6,
                0,
                vault.strategyHash(),
                vault.riskHash(),
                address(registry),
                vault.agentId()
            )
        );
        vm.stopPrank();
        vm.warp(block.timestamp + 1 days);
        fresh();
        vm.prank(controller);
        vault.applyConfig();
        vm.prank(controller);
        vault.unpause();
        quote.mint(alice, 100e6);
        quote.mint(bob, 100e6);
        vm.prank(alice);
        quote.approve(address(gateway), 100e6);
        vm.prank(bob);
        quote.approve(address(gateway), 100e6);
    }

    function buy(uint256 amount, uint256 minOut) internal {
        vm.prank(manager);
        vault.managerTrade(
            address(quote), address(position), amount, minOut, block.timestamp + 60, address(venue)
        );
    }

    function testScalingAndRoundTrip() public {
        assertEq(source.price(), 2e6);
        assertEq(source.markedValue(5e18), 10e6);
        vm.prank(alice);
        uint256 shares = gateway.deposit(20e6, 20e12, block.timestamp + 60);
        assertEq(shares, 20e12);
        buy(10e6, 1);
        assertEq(position.balanceOf(address(vault)), 5e18);
        assertEq(vault.totalAssets(), 20e6);
        vm.prank(manager);
        vault.managerTrade(address(position), address(quote), 5e18, 1, block.timestamp + 60, address(venue));
        assertEq(quote.allowance(address(vault), address(adapter)), 0);
        assertEq(quote.allowance(address(adapter), address(venue)), 0);
        assertEq(quote.allowance(address(venue), address(router)), 0);
        assertEq(quote.allowance(address(gateway), address(vault)), 0);
        vm.prank(alice);
        vault.approve(address(gateway), shares);
        vm.prank(alice);
        assertEq(gateway.redeem(shares, 20e6, block.timestamp + 60), 20e6);
        assertEq(quote.balanceOf(alice), 100e6);
        assertEq(vault.totalSupply(), 0);
    }

    function testSellCapUsesEighteenDecimalNotional() public {
        vm.prank(alice);
        gateway.deposit(30e6, 1, block.timestamp + 60);
        buy(10e6, 1);
        buy(10e6, 1);
        vm.prank(manager);
        vm.expectRevert(UnoraVault.ExceedsPerTradeCap.selector);
        vault.managerTrade(address(position), address(quote), 6e18, 1, block.timestamp + 60, address(venue));
    }

    function testStaleAndFutureAndUncertainFeedsBlock() public {
        vm.warp(block.timestamp + 301);
        (bool ok,) = source.status();
        assertFalse(ok);
        vm.prank(alice);
        vm.expectRevert();
        gateway.deposit(1e6, 1, block.timestamp + 60);
        fresh();
        pyth.set(MON, 200000000, 1000, -8, block.timestamp + 1);
        (ok,) = source.status();
        assertFalse(ok);
        fresh();
        pyth.set(USD, 100000000, 2000000, -8, block.timestamp);
        (ok,) = source.status();
        assertFalse(ok);
        fresh();
        pyth.set(MON, -1, 0, -8, block.timestamp);
        (ok,) = source.status();
        assertFalse(ok);
        fresh();
        pyth.set(MON, 1, 0, -19, block.timestamp);
        (ok,) = source.status();
        assertFalse(ok);
    }

    function testOracleFloorCannotBeLowered() public {
        vm.prank(alice);
        gateway.deposit(20e6, 1, block.timestamp + 60);
        router.setHaircut(101);
        vm.expectRevert();
        buy(10e6, 1);
        assertEq(quote.balanceOf(address(vault)), 20e6);
        assertEq(position.balanceOf(address(vault)), 0);
        router.setHaircut(100);
        buy(10e6, 1);
        assertEq(position.balanceOf(address(vault)), 4.95e18);
    }

    function testRouterCannotLieAboutReceivedOutput() public {
        vm.prank(alice);
        gateway.deposit(20e6, 1, block.timestamp + 60);
        router.setLie(true);
        vm.expectRevert();
        buy(10e6, 1);
    }

    function testGatewayLimitsAreAtomic() public {
        vm.prank(alice);
        vm.expectRevert();
        gateway.deposit(10e6, 11e12, block.timestamp + 60);
        assertEq(quote.balanceOf(alice), 100e6);
        vm.prank(alice);
        uint256 shares = gateway.deposit(10e6, 10e12, block.timestamp + 60);
        vm.prank(alice);
        vault.approve(address(gateway), shares);
        vm.prank(alice);
        vm.expectRevert();
        gateway.redeem(shares, 11e6, block.timestamp + 60);
        assertEq(vault.balanceOf(alice), shares);
        vm.prank(bob);
        vm.expectRevert();
        gateway.redeem(shares, 1, block.timestamp + 60);
        vm.prank(alice);
        vm.expectRevert();
        gateway.deposit(1e6, 1, block.timestamp - 1);
    }

    function testLiquidityAndManagerAuthority() public {
        vm.prank(alice);
        uint256 shares = gateway.deposit(10e6, 1, block.timestamp + 60);
        buy(10e6, 1);
        vm.prank(alice);
        vault.approve(address(gateway), shares);
        vm.prank(alice);
        vm.expectRevert(UnoraVault.InsufficientQuoteLiquidity.selector);
        gateway.redeem(shares, 1, block.timestamp + 60);
        vm.prank(bob);
        vm.expectRevert();
        venue.swap(address(quote), address(position), 1e6, 1, address(vault));
        vm.prank(bob);
        vm.expectRevert(UnoraVault.NotManager.selector);
        vault.managerTrade(address(quote), address(position), 1e6, 1, block.timestamp + 60, address(venue));
    }

    function testCallbackAndPartialFillAreRejected() public {
        vm.expectRevert();
        venue.unlockCallback(abi.encode(address(quote), address(position), 1e6, 1));
        vm.prank(alice);
        gateway.deposit(20e6, 1, block.timestamp + 60);
        router.setPartial(true);
        vm.expectRevert();
        buy(10e6, 1);
        assertEq(quote.balanceOf(address(vault)), 20e6);
    }

    function testLaterDepositAfterLossDoesNotDiluteFirstInvestor() public {
        vm.prank(alice);
        uint256 a = gateway.deposit(20e6, 1, block.timestamp + 60);
        buy(10e6, 1);
        pyth.set(MON, 100000000, 1000, -8, block.timestamp);
        assertEq(vault.totalAssets(), 15e6);
        vm.prank(bob);
        gateway.deposit(15e6, 1, block.timestamp + 60);
        assertApproxEqAbs(vault.previewRedeem(a), 15e6, 1);
    }
}
