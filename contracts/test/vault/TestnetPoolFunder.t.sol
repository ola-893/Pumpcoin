// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TestnetPoolFunder, IFundingManager} from "../../src/vault/TestnetPoolFunder.sol";
import {IV4Manager} from "../../src/vault/UniswapV4VaultVenue.sol";
import {NativeWrappedFixture} from "./NativeVaultInvestorGateway.t.sol";
import {RegistrationTokenFixture} from "./PumpCoinRegisteredVault.t.sol";
contract FundingPriceFixture { bool public stale;function setStale(bool x) external{stale=x;}function referencePrice() external view returns(uint256){require(!stale,"stale");return 25000;} }
contract FundingManagerFixture {
    uint160 public sqrtPrice;int24 public tick;address public synced;uint256 public beforeBalance;bool public excessive;bool public wrongSettlement;
    address public quote;address public wrapped;uint256 public qPaid;uint256 public pPaid;
    constructor(address q,address p){quote=q;wrapped=p;}
    function getSlot0(bytes32) external view returns(uint160,int24,uint24,uint24){return(sqrtPrice,tick,0,500);}
    function initialize(IV4Manager.PoolKey calldata k,uint160 p) external returns(int24){require(k.currency0==quote&&k.currency1==wrapped&&k.hooks==address(0)&&k.fee==500&&k.tickSpacing==10);require(sqrtPrice==0);sqrtPrice=p;tick=313205;return tick;}
    function setExcessive(bool x) external{excessive=x;}function setWrongSettlement(bool x) external{wrongSettlement=x;}
    function unlock(bytes calldata data) external returns(bytes memory){return TestnetPoolFunder(payable(msg.sender)).unlockCallback(data);}
    function modifyLiquidity(IV4Manager.PoolKey calldata,IFundingManager.ModifyLiquidityParams calldata p,bytes calldata) external returns(int256,int256){
        int128 q;int128 w;if(p.liquidityDelta>0){q=-int128(int256(uint256(excessive?300000:50000)));w=-int128(1 ether);qPaid=uint128(-q);pPaid=uint128(-w);}else{q=int128(uint128(qPaid));w=int128(uint128(pPaid));}
        return(int256(q)<<128|int256(uint256(uint128(w))),0);
    }
    function sync(address t) external{synced=t;beforeBalance=IERC20(t).balanceOf(address(this));}
    function settle() external returns(uint256){uint256 paid=IERC20(synced).balanceOf(address(this))-beforeBalance;return wrongSettlement?paid+1:paid;}
    function take(address t,address to,uint256 amount) external{IERC20(t).transfer(to,amount);}
}
contract TestnetPoolFunderTest is Test {
    RegistrationTokenFixture quote;NativeWrappedFixture wrapped;FundingPriceFixture source;FundingManagerFixture pool;TestnetPoolFunder funder;
    address owner=makeAddr("controller");address outsider=makeAddr("outsider");
    function setUp() public{vm.warp(1800000000);vm.etch(address(0x1000),address(new RegistrationTokenFixture(6)).code);quote=RegistrationTokenFixture(address(0x1000));vm.etch(address(0x2000),address(new NativeWrappedFixture()).code);wrapped=NativeWrappedFixture(address(0x2000));source=new FundingPriceFixture();pool=new FundingManagerFixture(address(quote),address(wrapped));funder=new TestnetPoolFunder(owner,address(quote),address(wrapped),address(pool),address(pool),address(source),500,10);quote.mint(owner,20e6);vm.deal(owner,7 ether);vm.prank(owner);quote.approve(address(funder),200000);}
    function seed() internal{vm.prank(owner);funder.seed{value:3 ether}(1000000,313200,313210,200000,block.timestamp+120);}
    function testSeedRefundsUnusedAndControllerCanRemoveAndReseed() public{seed();assertEq(owner.balance,6 ether);assertEq(quote.balanceOf(owner),20e6-50000);assertEq(funder.liquidity(),1000000);assertEq(quote.balanceOf(address(funder)),0);assertEq(wrapped.balanceOf(address(funder)),0);assertEq(address(funder).balance,0);vm.prank(owner);funder.remove(block.timestamp+120);assertEq(owner.balance,7 ether);assertEq(quote.balanceOf(owner),20e6);assertEq(funder.liquidity(),0);vm.prank(owner);quote.approve(address(funder),200000);seed();}
    function testUnauthorizedControllerCallbackAndNativeTransferRejected() public{vm.prank(outsider);vm.expectRevert();funder.seed{value:1 ether}(1000000,313200,313210,200000,block.timestamp+120);vm.expectRevert();funder.unlockCallback("");vm.deal(outsider,1 ether);vm.prank(outsider);(bool ok,)=address(funder).call{value:1}("");assertFalse(ok);seed();vm.prank(outsider);vm.expectRevert();funder.remove(block.timestamp+120);}
    function testOverspendingAndIncorrectSettlementRollbackAllFunding() public{pool.setExcessive(true);vm.expectRevert();seed();assertEq(owner.balance,7 ether);assertEq(quote.balanceOf(owner),20e6);assertEq(funder.liquidity(),0);pool.setExcessive(false);pool.setWrongSettlement(true);vm.expectRevert();seed();assertEq(owner.balance,7 ether);assertEq(quote.balanceOf(owner),20e6);}
    function testStalePriceExpiredOverBudgetAndWideRangeRejected() public{source.setStale(true);vm.expectRevert();seed();source.setStale(false);vm.startPrank(owner);vm.expectRevert();funder.seed{value:3 ether}(1000000,313200,313210,200000,block.timestamp-1);vm.expectRevert();funder.seed{value:4 ether}(1000000,313200,313210,200000,block.timestamp+120);vm.expectRevert();funder.seed{value:3 ether}(1000000,313170,313240,200000,block.timestamp+120);vm.stopPrank();seed();vm.expectRevert();seed();}
}
