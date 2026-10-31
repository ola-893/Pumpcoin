// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IV4Manager} from "../../src/vault/UniswapV4VaultVenue.sol";
import {TestnetPoolFunder} from "../../src/vault/TestnetPoolFunder.sol";
interface IPoolMaintenanceRouter {
 function manager() external view returns(address);
 struct Settings {bool takeClaims;bool settleUsingBurn;}
 function swap(IV4Manager.PoolKey calldata,IV4Manager.SwapParams calldata,Settings calldata,bytes calldata) external payable returns(int256);
}
interface IMaintenanceState {function getSlot0(bytes32) external view returns(uint160,int24,uint24,uint24);function getLiquidity(bytes32) external view returns(uint128);}
interface IMaintenancePrice {function referencePrice() external view returns(uint256);function status() external view returns(bool,uint64);}
interface IMaintenanceWrapped {function deposit() external payable;}
/// Simulation only. No fork balances or transactions are live demonstration evidence.
contract SepoliaPoolMaintenanceForkTest is Test {
 function testForkBoundedRealignmentAndReseed() external {
  if(!vm.envOr("PUMPCOIN_SEPOLIA_FORK",false)){vm.skip(true);return;}
  vm.createSelectFork("https://ethereum-sepolia-rpc.publicnode.com");
  address owner=0xe26468ae02368a75DBDBea58F367B7313942ad26;
  address q=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
  address p=0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;
  address manager=0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
  IPoolMaintenanceRouter router=IPoolMaintenanceRouter(0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe);
  IMaintenanceState state=IMaintenanceState(0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C);
  IMaintenancePrice source=IMaintenancePrice(0x4b5945629f74357E43c5F7119c3429CF185AD026);
  TestnetPoolFunder funder=TestnetPoolFunder(payable(0x184299685D95F31cCd4ADc0222367C4bd6Df0631));
  assertEq(block.chainid,11155111);assertEq(router.manager(),manager);assertEq(funder.controller(),owner);
  uint256 mark=source.referencePrice();uint160 fair=uint160(Math.sqrt(Math.mulDiv(1 ether,1<<192,mark)));
  bytes32 id=keccak256(abi.encode(q,p,uint24(1000),int24(10),address(0)));
  (uint160 beforeSqrt,,,)=state.getSlot0(id);assertGt(fair,beforeSqrt,"expected ETH spot above reference");
  uint256 beforeEth=owner.balance;uint256 beforeQ=IERC20(q).balanceOf(owner);
  vm.startPrank(owner);
  IMaintenanceWrapped(p).deposit{value:0.0001 ether}();
  IERC20(p).approve(address(router),0.0001 ether);
  int256 delta=router.swap(IV4Manager.PoolKey(q,p,1000,10,address(0)),IV4Manager.SwapParams(false,-int256(0.0001 ether),fair),IPoolMaintenanceRouter.Settings(false,false),"");
  int128 paid=int128(delta);int128 out=int128(delta>>128);
  assertLt(paid,0);assertGe(paid,-int128(0.0001 ether));assertGt(out,0);
  IERC20(p).approve(address(router),0);
  funder.remove(block.timestamp+300);
  (uint160 aligned,int24 tick,,)=state.getSlot0(id);assertEq(aligned,fair);
  int24 lower=tick/10*10;if(tick<0&&tick%10!=0)lower-=10;
  uint128 liq=uint128((125e6*uint256(aligned)+(1<<96)-1)/(1<<96));
  IERC20(q).approve(address(funder),200000);
  funder.seed{value:0.0001 ether}(liq,lower,lower+20,200000,block.timestamp+300);
  IERC20(q).approve(address(funder),0);
  vm.stopPrank();
  (bool healthy,)=source.status();assertTrue(healthy);assertGt(state.getLiquidity(id),0);
  assertLe(beforeEth-owner.balance,0.0002 ether);assertGe(IERC20(q).balanceOf(owner)+200000,beforeQ);
  emit log_named_uint("block",block.number);emit log_named_uint("maximum swap WETH input",0.0001 ether);
  emit log_named_uint("actual swap WETH input",uint128(-paid));emit log_named_uint("test-USDC output",uint128(out));
  emit log_named_uint("reference quote base units per ETH",mark);emit log_named_uint("native consumed excluding gas",beforeEth-owner.balance);
 }
}
