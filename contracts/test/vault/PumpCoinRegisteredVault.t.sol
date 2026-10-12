// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PumpCoinRegisteredVault, IPumpCoinIdentityRegistry} from "../../src/vault/PumpCoinRegisteredVault.sol";
import {UnoraVault} from "../../src/vault/UnoraVault.sol";
import {VaultValuationSource} from "../../src/vault/VaultValuationSource.sol";
// TEST ONLY, canonical register overload and real ERC-721 ownership.
contract RegistrationRegistryFixture is ERC721URIStorage {
    uint256 public next;
    constructor() ERC721("Fixture", "FIX") {}
    function register(string calldata uri, IPumpCoinIdentityRegistry.MetadataEntry[] calldata) external returns (uint256 id) { id=++next; _safeMint(msg.sender,id); _setTokenURI(id,uri); }
}
contract RegistrationTokenFixture is ERC20 {
    uint8 immutable places;
    constructor(uint8 d) ERC20("Fixture", "FIX") { places=d; }
    function decimals() public view override returns(uint8) { return places; }
    function mint(address to,uint256 amount) external { _mint(to,amount); }
}
contract PumpCoinRegisteredVaultTest is Test {
    RegistrationRegistryFixture registry;
    RegistrationTokenFixture quote;
    RegistrationTokenFixture position;
    address controller=makeAddr("controller"); address manager=makeAddr("manager"); address attacker=makeAddr("attacker");
    function setUp() public { registry=new RegistrationRegistryFixture(); quote=new RegistrationTokenFixture(6); position=new RegistrationTokenFixture(18); }
    function args() internal view returns(PumpCoinRegisteredVault.Registration memory) { return PumpCoinRegisteredVault.Registration(IERC20(address(quote)),IERC20(address(position)),controller,manager,keccak256("strategy"),keccak256("risk"),10e6,50e6,address(registry),"data:application/json;base64,e30=",keccak256("manifest")); }
    function create() internal returns(PumpCoinRegisteredVault v) { vm.prank(controller); v=new PumpCoinRegisteredVault(args()); }
    function cfg(PumpCoinRegisteredVault v,address source) internal view returns(UnoraVault.ConfigArgs memory) { return UnoraVault.ConfigArgs(address(0),address(0),address(0),source,10e6,50e6,0,v.strategyHash(),v.riskHash(),address(registry),v.agentId()); }
    function testAtomicBinding() public { PumpCoinRegisteredVault v=create(); assertEq(v.admin(),controller); assertEq(v.manager(),manager); assertEq(registry.ownerOf(v.agentId()),controller); assertEq(v.registrationCommitment(),keccak256("manifest")); assertEq(v.perTradeCap(),10e6); assertEq(v.maxPositionValue(),50e6); assertTrue(v.paused()); assertEq(address(v.adapter()),address(0)); assertEq(v.totalSupply(),0); (bool ok,)=v.valuationSource().status(); assertFalse(ok); assertEq(v.valuationSource().positionDecimals(),18); }
    function testDedicatedVaults() public { PumpCoinRegisteredVault a=create(); PumpCoinRegisteredVault b=create(); assertTrue(address(a)!=address(b)); assertTrue(a.agentId()!=b.agentId()); }
    function testOnlyControllerAndDistinctManager() public { vm.prank(attacker); vm.expectRevert("controller"); new PumpCoinRegisteredVault(args()); PumpCoinRegisteredVault.Registration memory r=args(); r.manager=controller; vm.prank(controller); vm.expectRevert("controller"); new PumpCoinRegisteredVault(r); assertEq(registry.next(),0); }
    function testIdentityTransferDoesNotTransferAuthority() public { PumpCoinRegisteredVault v=create(); uint256 id=v.agentId(); vm.prank(controller); registry.transferFrom(controller,attacker,id); assertEq(v.admin(),controller); assertEq(v.manager(),manager); vm.prank(attacker); vm.expectRevert(); v.unpause(); }
    function testUnpausingCannotEnableDepositsOrTrades() public { PumpCoinRegisteredVault v=create(); quote.mint(controller,100e6); vm.startPrank(controller); quote.approve(address(v),100e6); vm.expectRevert(); v.deposit(1e6,controller); v.unpause(); vm.expectRevert(); v.deposit(1e6,controller); vm.stopPrank(); vm.prank(manager); vm.expectRevert(); v.managerTrade(address(quote),address(position),1e6,1,block.timestamp+60,address(0)); assertEq(quote.balanceOf(controller),100e6); assertEq(v.totalSupply(),0); }
    function testRejectsWrongValuationDecimals() public { PumpCoinRegisteredVault v=create(); VaultValuationSource source=new VaultValuationSource(controller,1e18,2 days); UnoraVault.ConfigArgs memory c=cfg(v,address(source)); vm.prank(controller); vm.expectRevert(); v.proposeConfig(c); }
    function testActivationNoticeHistoryAndDonationResistance() public { position=new RegistrationTokenFixture(6); PumpCoinRegisteredVault v=create(); VaultValuationSource source=new VaultValuationSource(controller,1e18,2 days); quote.mint(address(v),1); position.mint(address(v),1); UnoraVault.ConfigArgs memory c=cfg(v,address(source)); vm.startPrank(controller); v.proposeConfig(c); vm.expectRevert(UnoraVault.ConfigNotReady.selector); v.applyConfig(); vm.warp(block.timestamp+1 days+1); v.applyConfig(); vm.stopPrank(); assertEq(address(v.valuationSource()),address(source)); assertTrue(v.paused()); assertEq(v.periodId(),3); assertEq(v.totalSupply(),0); vm.warp(block.timestamp+3 days); vm.prank(controller); v.proposeConfig(c); vm.warp(block.timestamp+1 days+1); vm.prank(controller); vm.expectRevert(); v.applyConfig(); }
}
