// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IV4Manager} from "./UniswapV4VaultVenue.sol";
interface IFundingManager {
    struct ModifyLiquidityParams { int24 tickLower; int24 tickUpper; int256 liquidityDelta; bytes32 salt; }
    function initialize(IV4Manager.PoolKey calldata, uint160) external returns (int24);
    function modifyLiquidity(IV4Manager.PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata) external returns (int256, int256);
}
interface IFundingState { function getSlot0(bytes32) external view returns(uint160, int24, uint24, uint24); }
interface IFundingPrice { function referencePrice() external view returns(uint256); }
interface IFundingWrapped { function deposit() external payable; function withdraw(uint256) external; }
/// @notice Controller-owned testnet LP. Never receives or spends vault assets.
/// Fixed hook-free pool, exact bounded settlement, and complete controller exit.
contract TestnetPoolFunder is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable controller;
    address public immutable quote;
    address public immutable position;
    IV4Manager public immutable poolManager;
    IFundingState public immutable stateView;
    IFundingPrice public immutable source;
    uint24 public immutable fee;
    int24 public immutable tickSpacing;
    bytes32 public immutable poolId;
    int24 public tickLower;
    int24 public tickUpper;
    uint128 public liquidity;
    bytes32 private active;
    error InvalidFunding();
    constructor(address owner, address q, address p, address pm, address sv, address prices, uint24 f, int24 spacing) {
        require(owner != address(0) && q < p && q.code.length > 0 && p.code.length > 0 && pm.code.length > 0 && sv.code.length > 0 && prices.code.length > 0, "bindings");
        require(f > 0 && f < 1000000 && spacing > 0 && spacing <= 100, "pool");
        controller=owner;quote=q;position=p;poolManager=IV4Manager(pm);stateView=IFundingState(sv);source=IFundingPrice(prices);fee=f;tickSpacing=spacing;
        poolId=keccak256(abi.encode(q,p,f,spacing,address(0)));
    }
    modifier onlyController() { if(msg.sender != controller) revert InvalidFunding(); _; }
    function key() private view returns(IV4Manager.PoolKey memory) { return IV4Manager.PoolKey(quote,position,fee,tickSpacing,address(0)); }
    function seed(uint128 amount, int24 lower, int24 upper, uint256 maxQuote, uint256 deadline) external payable onlyController nonReentrant {
        if(block.timestamp > deadline || deadline > block.timestamp+300 || amount==0 || liquidity!=0 || msg.value==0 || msg.value>3 ether || maxQuote==0 || maxQuote>200000 || lower%tickSpacing!=0 || upper%tickSpacing!=0 || upper-lower>4*tickSpacing || lower>=upper) revert InvalidFunding();
        uint256 mark=source.referencePrice();
        if(mark==0) revert InvalidFunding();
        uint160 fair=uint160(Math.sqrt(Math.mulDiv(1 ether,uint256(1)<<192,mark)));
        (uint160 sqrtPrice,int24 tick,,)=stateView.getSlot0(poolId);
        if(sqrtPrice==0) { tick=IFundingManager(address(poolManager)).initialize(key(),fair);sqrtPrice=fair; }
        uint256 spot=Math.mulDiv(1 ether,uint256(1)<<192,uint256(sqrtPrice)*sqrtPrice);
        if(Math.mulDiv(spot>mark?spot-mark:mark-spot,10000,mark)>500 || tick<lower || tick>=upper) revert InvalidFunding();
        uint256 beforeQuote=IERC20(quote).balanceOf(address(this));
        uint256 beforePosition=IERC20(position).balanceOf(address(this));
        IERC20(quote).safeTransferFrom(controller,address(this),maxQuote);
        if(IERC20(quote).balanceOf(address(this))!=beforeQuote+maxQuote) revert InvalidFunding();
        IFundingWrapped(position).deposit{value:msg.value}();
        if(IERC20(position).balanceOf(address(this))!=beforePosition+msg.value) revert InvalidFunding();
        bytes memory data=abi.encode(true,amount,lower,upper,maxQuote,msg.value);
        active=keccak256(data);poolManager.unlock(data);
        if(active!=bytes32(0)) revert InvalidFunding();
        tickLower=lower;tickUpper=upper;liquidity=amount;
        uint256 q=IERC20(quote).balanceOf(address(this))-beforeQuote;
        uint256 p=IERC20(position).balanceOf(address(this))-beforePosition;
        if(q>0) IERC20(quote).safeTransfer(controller,q);
        if(p>0) { IFundingWrapped(position).withdraw(p); (bool ok,)=controller.call{value:p}("");require(ok,"refund"); }
    }
    function remove(uint256 deadline) external onlyController nonReentrant {
        if(liquidity==0 || block.timestamp>deadline || deadline>block.timestamp+300) revert InvalidFunding();
        bytes memory data=abi.encode(false,liquidity,tickLower,tickUpper,uint256(0),uint256(0));
        active=keccak256(data);poolManager.unlock(data);
        if(active!=bytes32(0)) revert InvalidFunding();
        liquidity=0;
        uint256 q=IERC20(quote).balanceOf(address(this));uint256 p=IERC20(position).balanceOf(address(this));
        if(q>0) IERC20(quote).safeTransfer(controller,q);
        if(p>0) { IFundingWrapped(position).withdraw(p); (bool ok,)=controller.call{value:p}("");require(ok,"refund"); }
    }
    function unlockCallback(bytes calldata data) external returns(bytes memory) {
        if(msg.sender!=address(poolManager) || active==bytes32(0) || keccak256(data)!=active) revert InvalidFunding();
        active=bytes32(0);
        (bool adding,uint128 amount,int24 lower,int24 upper,uint256 maxQuote,uint256 maxPosition)=abi.decode(data,(bool,uint128,int24,int24,uint256,uint256));
        (int256 delta,)=IFundingManager(address(poolManager)).modifyLiquidity(key(),IFundingManager.ModifyLiquidityParams(lower,upper,adding?int256(uint256(amount)):-int256(uint256(amount)),bytes32(0)),"");
        settle(quote,int128(delta>>128),maxQuote,adding);settle(position,int128(delta),maxPosition,adding);
        return "";
    }
    function settle(address token,int128 delta,uint256 maximum,bool adding) private {
        if(delta<0) { uint256 paid=uint256(-int256(delta));if(!adding || paid>maximum) revert InvalidFunding();poolManager.sync(token);IERC20(token).safeTransfer(address(poolManager),paid);if(poolManager.settle()!=paid) revert InvalidFunding(); }
        else if(delta>0) poolManager.take(token,address(this),uint128(delta));
    }
    receive() external payable { require(msg.sender==position,"wrapped only"); }
}
