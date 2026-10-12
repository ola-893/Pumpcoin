// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PumpCoinRegisteredVault, UnoraVault} from "../../src/vault/PumpCoinRegisteredVault.sol";
import {NativeVaultInvestorGateway} from "../../src/vault/NativeVaultInvestorGateway.sol";
import {RegistrationTokenFixture, RegistrationRegistryFixture} from "./PumpCoinRegisteredVault.t.sol";
import {TradingRouterFixture} from "./VaultTradingIntegration.t.sol";

// Test fixtures only: these are never used for a public testnet demo.
contract NativeWrappedFixture is ERC20 {
    constructor() ERC20("Wrapped fixture", "WMON") {}
    function mint(address to,uint256 amount) external { _mint(to,amount); }
    function deposit() external payable { _mint(msg.sender,msg.value); }
    function withdraw(uint256 amount) external { _burn(msg.sender,amount); (bool ok,)=msg.sender.call{value:amount}("");require(ok); }
}
contract NativePriceFixture {
    uint8 public constant positionDecimals=18;
    bytes32 public immutable poolId;
    bool public healthy=true;
    constructor(address q,address w){poolId=keccak256(abi.encode(q,w,uint24(3000),int24(60),address(0)));}
    function setHealthy(bool value) external { healthy=value; }
    function price() public view returns(uint256){require(healthy,"unhealthy");return 2e6;}
    function status() external view returns(bool,bytes32){return(healthy,healthy?bytes32(0):keccak256("STALE"));}
    function markedValue(uint256 amount) external view returns(uint256){return amount*price()/1e18;}
}
contract RejectNativeInvestor {
    function invest(NativeVaultInvestorGateway g) external payable {g.depositMON{value:msg.value}(1,1,block.timestamp+120);}
    function exit(NativeVaultInvestorGateway g,UnoraVault v) external {uint256 s=v.balanceOf(address(this));v.approve(address(g),s);g.redeemMON(s,1,1,block.timestamp+120);}
    receive() external payable { revert("reject native"); }
}
contract NativeVaultInvestorGatewayTest is Test {
    RegistrationTokenFixture quote;
    NativeWrappedFixture wrapped;
    NativePriceFixture source;
    TradingRouterFixture pool;
    PumpCoinRegisteredVault vault;
    NativeVaultInvestorGateway gateway;
    address alice=makeAddr("alice");address bob=makeAddr("bob");
    function onERC721Received(address,address,uint256,bytes calldata) external pure returns(bytes4){return 0x150b7a02;}
    function setUp() public {
        vm.warp(1800000000);
        vm.etch(address(0x1000),address(new RegistrationTokenFixture(6)).code);quote=RegistrationTokenFixture(address(0x1000));
        vm.etch(address(0x2000),address(new NativeWrappedFixture()).code);wrapped=NativeWrappedFixture(address(0x2000));vm.deal(address(wrapped),100000 ether);
        pool=new TradingRouterFixture();source=new NativePriceFixture(address(quote),address(wrapped));
        RegistrationRegistryFixture registry=new RegistrationRegistryFixture();
        vault=new PumpCoinRegisteredVault(PumpCoinRegisteredVault.Registration(IERC20(address(quote)),IERC20(address(wrapped)),address(this),makeAddr("manager"),keccak256("strategy"),keccak256("risk"),10e6,50e6,address(registry),"data:application/json;base64,e30=",keccak256("manifest")));
        vault.proposeConfig(UnoraVault.ConfigArgs(address(0),address(0),address(0),address(source),10e6,50e6,0,vault.strategyHash(),vault.riskHash(),address(registry),vault.agentId()));
        vm.warp(block.timestamp+1 days+1);vault.applyConfig();vault.unpause();
        gateway=new NativeVaultInvestorGateway(address(vault),address(pool),address(source),3000,60,50);
        pool.setHaircut(25);vm.deal(alice,100 ether);vm.deal(bob,100 ether);
    }
    function enter(address who,uint256 amount) internal returns(uint256 shares){vm.prank(who);(,shares)=gateway.depositMON{value:amount}(1,1,block.timestamp+120);}
    function exit(address who,uint256 shares) internal returns(uint256 mon){vm.startPrank(who);vault.approve(address(gateway),shares);(,mon)=gateway.redeemMON(shares,1,1,block.timestamp+120);vm.stopPrank();}
    function testAtomicRoundTripIncludesConversionFeesAndNoResidue() public {
        uint256 shares=enter(alice,10 ether);assertEq(shares,19950000e6);assertEq(quote.balanceOf(address(vault)),19950000);assertEq(quote.allowance(address(gateway),address(vault)),0);
        uint256 mon=exit(alice,shares);assertEq(mon,9.9500625 ether);assertEq(vault.balanceOf(alice),0);assertEq(vault.allowance(alice,address(gateway)),0);assertEq(address(gateway).balance,0);assertEq(quote.balanceOf(address(gateway)),0);assertEq(wrapped.balanceOf(address(gateway)),0);
    }
    function testDepositsDoNotCreateProfitAndNewInvestorReceivesFairOwnership() public {
        uint256 a=enter(alice,10 ether);uint256 beforeValue=vault.previewRedeem(a);enter(bob,10 ether);assertEq(vault.previewRedeem(a),beforeValue);
        quote.mint(address(vault),10e6);uint256 value=vault.previewRedeem(a);uint256 b=enter(bob,10 ether);assertLt(b,a);assertApproxEqAbs(vault.previewRedeem(a),value,1);
    }
    function testProfitAndLossChangeMONExitAtCurrentNAV() public {
        uint256 s=enter(alice,10 ether);quote.mint(address(vault),10e6);uint256 expected=vault.previewRedeem(s)*1e18/2e6*9975/10000;assertEq(exit(alice,s),expected);assertGt(expected,10 ether);
        s=enter(bob,10 ether);deal(address(quote),address(vault),10e6);expected=vault.previewRedeem(s)*1e18/2e6*9975/10000;assertEq(exit(bob,s),expected);assertLt(expected,10 ether);
    }
    function testMinimumOrPoolFillFailureRollsBackInvestment() public {
        uint256 cash=alice.balance;vm.prank(alice);vm.expectRevert();gateway.depositMON{value:10 ether}(1,type(uint256).max,block.timestamp+120);assertEq(alice.balance,cash);assertEq(vault.totalSupply(),0);
        pool.setPartial(true);vm.prank(alice);vm.expectRevert();gateway.depositMON{value:10 ether}(1,1,block.timestamp+120);assertEq(vault.totalSupply(),0);
        pool.setPartial(false);pool.setLie(true);vm.prank(alice);vm.expectRevert();gateway.depositMON{value:10 ether}(1,1,block.timestamp+120);assertEq(vault.totalSupply(),0);
    }
    function testOracleDeviationFloorRejectsExcessiveConversionLoss() public {pool.setHaircut(100);vm.prank(alice);vm.expectRevert();gateway.depositMON{value:10 ether}(1,1,block.timestamp+120);assertEq(vault.totalSupply(),0);}
    function testExitFailureRestoresSharesAndExactApproval() public {uint256 s=enter(alice,10 ether);vm.startPrank(alice);vault.approve(address(gateway),s);vm.expectRevert();gateway.redeemMON(s,1,20 ether,block.timestamp+120);assertEq(vault.balanceOf(alice),s);assertEq(vault.allowance(alice,address(gateway)),s);vm.stopPrank();}
    function testStalePausedExpiredAndUnauthorizedCallbackFailClosed() public {
        source.setHealthy(false);vm.prank(alice);vm.expectRevert();gateway.depositMON{value:10 ether}(1,1,block.timestamp+120);source.setHealthy(true);
        vault.pause();vm.prank(alice);vm.expectRevert();gateway.depositMON{value:10 ether}(1,1,block.timestamp+120);vault.unpause();
        vm.prank(alice);vm.expectRevert();gateway.depositMON{value:10 ether}(1,1,block.timestamp-1);vm.expectRevert();gateway.unlockCallback("");
    }
    function testCannotSpendAnotherOwnersSharesOrSweepDonations() public {
        uint256 s=enter(alice,10 ether);vm.prank(bob);vm.expectRevert();gateway.redeemMON(s,1,1,block.timestamp+120);
        quote.mint(address(gateway),123);wrapped.mint(address(gateway),456);vm.deal(address(gateway),789);enter(bob,10 ether);exit(alice,s);assertEq(quote.balanceOf(address(gateway)),123);assertEq(wrapped.balanceOf(address(gateway)),456);assertEq(address(gateway).balance,789);
    }
    function testRejectedNativeReceiverRevertsEntireRedemption() public {
        RejectNativeInvestor investor=new RejectNativeInvestor();investor.invest{value:10 ether}(gateway);uint256 s=vault.balanceOf(address(investor));vm.expectRevert();investor.exit(gateway,vault);assertEq(vault.balanceOf(address(investor)),s);
    }
    function testFuzzRoundTrip(uint96 input) public {uint256 amount=bound(uint256(input),1 ether,90 ether);uint256 s=enter(alice,amount);uint256 expected=vault.previewRedeem(s)*1e18/2e6*9975/10000;assertEq(exit(alice,s),expected);assertLe(expected,amount);}
}
