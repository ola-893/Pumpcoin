// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PumpCoinRegisteredVault} from "../../src/vault/PumpCoinRegisteredVault.sol";
import {PumpCoinSepoliaDemoRegisteredVault} from "../../src/vault/PumpCoinSepoliaDemoRegisteredVault.sol";
import {SepoliaChainlinkVaultTradingBundle} from "../../src/vault/SepoliaChainlinkVaultTradingBundle.sol";
import {SepoliaChainlinkVaultValuationSource,IChainlinkProxy} from "../../src/vault/SepoliaChainlinkVaultValuationSource.sol";
import {TestnetPoolFunder,IFundingManager} from "../../src/vault/TestnetPoolFunder.sol";
import {IV4Manager} from "../../src/vault/UniswapV4VaultVenue.sol";
import {UnoraVault} from "../../src/vault/UnoraVault.sol";
import {VaultValuationSource} from "../../src/vault/VaultValuationSource.sol";
import {NativeVaultInvestorGateway} from "../../src/vault/NativeVaultInvestorGateway.sol";

/// A fork executes against real external bytecode/state; it is not a public testnet receipt.
contract SepoliaExecutionForkTest is Test {
    address constant USDC=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address constant WETH=0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;
    address constant REGISTRY=0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant MANAGER=0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address constant STATE=0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C;
    function pin(address proxy) internal view returns(SepoliaChainlinkVaultValuationSource.Feed memory){
        address aggregator=IChainlinkProxy(proxy).aggregator();
        return SepoliaChainlinkVaultValuationSource.Feed(proxy,aggregator,proxy.codehash,aggregator.codehash,IChainlinkProxy(proxy).decimals());
    }
    function testForkDepositSwapBothDirectionsAndRedeem() public {
        if(!vm.envOr("PUMPCOIN_SEPOLIA_FORK",false)){vm.skip(true);return;}
        vm.createSelectFork(vm.envOr("SEPOLIA_RPC_URL",string("https://ethereum-sepolia-rpc.publicnode.com")));
        assertEq(block.chainid,11155111);
        address controller=makeAddr("Sepolia fork controller");address agent=makeAddr("Sepolia fork agent");
        vm.deal(controller,1 ether);deal(USDC,controller,5e6);
        bytes32 strategy=keccak256("test strategy");bytes32 risk=keccak256("test policy");
        vm.startPrank(controller);
        PumpCoinSepoliaDemoRegisteredVault vault=new PumpCoinSepoliaDemoRegisteredVault(PumpCoinRegisteredVault.Registration(IERC20(USDC),IERC20(WETH),controller,agent,strategy,risk,100000,1000000,REGISTRY,"data:application/json,%7B%22name%22%3A%22Fork%20only%22%7D",keccak256("fork-only declaration")));
        uint24 fee=1000;int24 spacing=10;
        SepoliaChainlinkVaultTradingBundle bundle=new SepoliaChainlinkVaultTradingBundle(address(vault),SepoliaChainlinkVaultTradingBundle.Network(pin(0x694AA1769357215DE4FAC081bf1f309aDC325306),pin(0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E),MANAGER,STATE,fee,spacing),50);
        TestnetPoolFunder funder=new TestnetPoolFunder(controller,USDC,WETH,MANAGER,STATE,address(bundle.source()),fee,spacing);
        uint256 q96=1<<96;
        uint160 fair=uint160(Math.sqrt(Math.mulDiv(1 ether,1<<192,bundle.source().referencePrice())));
        int24 tick=IFundingManager(MANAGER).initialize(IV4Manager.PoolKey(USDC,WETH,fee,spacing,address(0)),fair);
        int24 lower=tick/spacing*spacing;if(tick<0&&tick%spacing!=0)lower-=spacing;
        uint128 liquidity=uint128((125e6*uint256(fair)+q96-1)/q96);
        IERC20(USDC).approve(address(funder),200000);
        funder.seed{value:0.0001 ether}(liquidity,lower,lower+2*spacing,200000,block.timestamp+120);
        (bool healthy,)=bundle.source().status();assertTrue(healthy);
        vault.proposeDemoConfig(UnoraVault.ConfigArgs(address(bundle.adapter()),address(bundle.venue()),address(0),address(bundle.source()),100000,1000000,0,strategy,risk,REGISTRY,vault.agentId()));
        vault.applyConfig();vault.unpause();
        IERC20(USDC).approve(address(bundle.gateway()),1e6);
        uint256 shares=bundle.gateway().deposit(1e6,1,block.timestamp+120);
        vault.grantTradingPermission(agent,vault.currentConfigHash(),uint64(block.timestamp+3600),100000,50);
        vm.stopPrank();
        vm.startPrank(agent);
        uint256 minimum=bundle.venue().minimumOutput(USDC,10000);
        vault.managerTrade(USDC,WETH,10000,minimum,block.timestamp+120,address(bundle.venue()));
        uint256 bought=IERC20(WETH).balanceOf(address(vault));assertGt(bought,0);
        vault.managerTrade(WETH,USDC,bought,bundle.venue().minimumOutput(WETH,bought),block.timestamp+120,address(bundle.venue()));
        vm.stopPrank();
        assertEq(IERC20(WETH).balanceOf(address(vault)),0);
        vm.startPrank(controller);
        NativeVaultInvestorGateway nativeGateway=new NativeVaultInvestorGateway(address(vault),MANAGER,address(bundle.source()),fee,spacing,50);
        (,uint256 nativeShares)=nativeGateway.depositMON{value:0.000001 ether}(1,1,block.timestamp+120);
        assertGt(nativeShares,0);vault.approve(address(nativeGateway),nativeShares);
        (,uint256 returned)=nativeGateway.redeemMON(nativeShares,1,1,block.timestamp+120);
        assertGt(returned,0.00000098 ether);assertLt(returned,0.000001 ether);
        assertEq(vault.balanceOf(controller),shares);
        vm.stopPrank();
        vm.startPrank(controller);vault.approve(address(bundle.gateway()),shares);uint256 assets=bundle.gateway().redeem(shares,1,block.timestamp+120);vm.stopPrank();
        assertGt(assets,990000);assertLe(assets,1000000);assertEq(vault.totalSupply(),0);
    }
}
