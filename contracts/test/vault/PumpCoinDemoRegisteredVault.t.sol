// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RegistrationRegistryFixture, RegistrationTokenFixture} from "./PumpCoinRegisteredVault.t.sol";
import {PumpCoinRegisteredVault} from "../../src/vault/PumpCoinRegisteredVault.sol";
import {PumpCoinDemoRegisteredVault} from "../../src/vault/PumpCoinDemoRegisteredVault.sol";
import {UnoraVault} from "../../src/vault/UnoraVault.sol";
import {VaultValuationSource} from "../../src/vault/VaultValuationSource.sol";
import {UnconfiguredValuationSource} from "../../src/vault/UnconfiguredValuationSource.sol";
contract PumpCoinDemoRegisteredVaultTest is Test {
    RegistrationRegistryFixture registry;
    RegistrationTokenFixture quote;
    RegistrationTokenFixture position;
    address controller=makeAddr("controller"); address manager=makeAddr("manager");
    function setUp() public { vm.chainId(10143); registry=new RegistrationRegistryFixture(); quote=new RegistrationTokenFixture(6); position=new RegistrationTokenFixture(6); }
    function args() internal view returns(PumpCoinRegisteredVault.Registration memory) { return PumpCoinRegisteredVault.Registration(IERC20(address(quote)),IERC20(address(position)),controller,manager,keccak256("strategy"),keccak256("risk"),10e6,50e6,address(registry),"data:application/json;base64,e30=",keccak256("demo manifest")); }
    function create() internal returns(PumpCoinDemoRegisteredVault v) { vm.prank(controller); v=new PumpCoinDemoRegisteredVault(args()); }
    function cfg(PumpCoinRegisteredVault v,address source) internal view returns(UnoraVault.ConfigArgs memory) { return UnoraVault.ConfigArgs(address(0),address(0),address(0),source,10e6,50e6,0,v.strategyHash(),v.riskHash(),address(registry),v.agentId()); }
    function testRejectsDeploymentOnOtherChains() public { vm.chainId(1); vm.prank(controller); vm.expectRevert("Monad testnet demo only"); new PumpCoinDemoRegisteredVault(args()); assertEq(registry.next(),0); }
    function testImmediateProposalStillRequiresController() public { PumpCoinDemoRegisteredVault v=create(); VaultValuationSource source=new VaultValuationSource(controller,1e18,300); UnoraVault.ConfigArgs memory c=cfg(v,address(source)); vm.prank(manager); vm.expectRevert(); v.proposeDemoConfig(c); }
    function testImmediateApplyRemainsPausedAndPreservesIdentityAndPermission() public { PumpCoinDemoRegisteredVault v=create(); VaultValuationSource source=new VaultValuationSource(controller,1e18,300); vm.startPrank(controller); v.proposeDemoConfig(cfg(v,address(source))); v.applyConfig(); vm.stopPrank(); assertTrue(v.instantTestnetDemo()); assertEq(v.DEMO_CONFIG_DELAY(),0); assertTrue(v.paused()); assertTrue(v.tradingPermissionRequired()); assertEq(v.totalSupply(),0); assertEq(registry.ownerOf(v.agentId()),controller); assertEq(address(v.valuationSource()),address(source)); assertEq(v.periodId(),3); }
    function testMissingValuationStillBlocksImmediateApplication() public { PumpCoinDemoRegisteredVault v=create(); UnconfiguredValuationSource source=new UnconfiguredValuationSource(6); UnoraVault.ConfigArgs memory c=cfg(v,address(source)); uint256 beforePeriod=v.periodId(); vm.startPrank(controller); v.proposeDemoConfig(c); vm.expectRevert(); v.applyConfig(); vm.stopPrank(); assertTrue(v.paused()); assertEq(v.periodId(),beforePeriod); }
    function testDecimalsAndVenueBindingsStillEnforced() public { PumpCoinDemoRegisteredVault v=create(); UnconfiguredValuationSource source=new UnconfiguredValuationSource(18); UnoraVault.ConfigArgs memory wrong=cfg(v,address(source)); UnoraVault.ConfigArgs memory c=cfg(v,address(v.valuationSource())); vm.startPrank(controller); vm.expectRevert(); v.proposeDemoConfig(wrong); c.venue=manager; vm.expectRevert(); v.proposeDemoConfig(c); vm.stopPrank(); }
    function testDepositsAndTradesStillBlockedBeforeHealthyActivation() public { PumpCoinDemoRegisteredVault v=create(); quote.mint(controller,1e6); vm.startPrank(controller); quote.approve(address(v),1e6); vm.expectRevert(); v.deposit(1e6,controller); vm.stopPrank(); vm.prank(manager); vm.expectRevert(); v.managerTrade(address(quote),address(position),1e6,1,block.timestamp+60,address(0)); assertEq(v.totalSupply(),0); }
    function testStandardVaultKeepsOneDayNotice() public { vm.prank(controller); PumpCoinRegisteredVault v=new PumpCoinRegisteredVault(args()); VaultValuationSource source=new VaultValuationSource(controller,1e18,2 days); vm.startPrank(controller); v.proposeConfig(cfg(v,address(source))); vm.expectRevert(UnoraVault.ConfigNotReady.selector); v.applyConfig(); vm.warp(block.timestamp+1 days); v.applyConfig(); vm.stopPrank(); }
    function testChainGuardAlsoAppliesToProposal() public { PumpCoinDemoRegisteredVault v=create(); UnoraVault.ConfigArgs memory c=cfg(v,address(v.valuationSource())); vm.chainId(1); vm.prank(controller); vm.expectRevert("Monad testnet demo only"); v.proposeDemoConfig(c); }
}
