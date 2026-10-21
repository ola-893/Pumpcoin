// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {GuardedHybridValuationSource} from "../../src/vault/GuardedHybridValuationSource.sol";
import {IVaultPyth} from "../../src/vault/PythVaultValuationSource.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {UnoraVault} from "../../src/vault/UnoraVault.sol";
import {VaultValuationSource} from "../../src/vault/VaultValuationSource.sol";
contract GuardTokenFixture is ERC20 {
    uint8 immutable places;
    constructor(uint8 d) ERC20("fixture", "FIX") { places = d; }
    function decimals() public view override returns (uint8) { return places; }
    function mint(address to, uint256 n) external { _mint(to, n); }
}
contract GuardQuoteFixture {
    uint256 public at;
    function set(uint256 t) external { at = t; }
    function getPriceUnsafe(bytes32) external view returns (IVaultPyth.Price memory) { return IVaultPyth.Price(1e8, 1, -8, at); }
}
contract GuardMarkFixture {
    uint256 public mark = 2e6;
    uint64 public at;
    address public pyth;
    address public stateView;
    bytes32 public quoteFeed = bytes32(uint256(1));
    bytes32 public poolId = bytes32(uint256(2));
    bool public available = true;
    constructor(address q, address pool) { pyth = q; stateView = pool; }
    function set(uint256 m, uint64 t) external { mark = m; at = t; }
    function fail() external { available = false; }
    function price() external view returns (uint256) { require(available, "underlying invalid"); return mark; }
    function readMon() external view returns (uint256, uint64) { return (mark, at); }
    function updatedAt() external view returns (uint64) { return at; }
}
contract GuardedHybridValuationSourceTest is Test {
    GuardedHybridValuationSource guard;
    GuardQuoteFixture quote;
    GuardMarkFixture source;
    GuardQuoteFixture pool;
    GuardTokenFixture cash;
    GuardTokenFixture position;
    UnoraVault shareVault;
    function setUp() public {
        vm.warp(1800000000); quote = new GuardQuoteFixture(); pool = new GuardQuoteFixture();
        source = new GuardMarkFixture(address(quote), address(pool));
        guard = new GuardedHybridValuationSource(address(source), address(source).codehash, address(quote).codehash, address(pool).codehash);
        fresh(2e6);
    }
    function fresh(uint256 value) internal { source.set(value, uint64(vm.getBlockTimestamp())); quote.set(vm.getBlockTimestamp()); }
    function activate() internal { assertFalse(guard.checkpoint()); vm.warp(vm.getBlockTimestamp() + 60); fresh(2e6); assertTrue(guard.checkpoint()); }
    function testBootstrapRequiresAdvancingSignedTimesAndDelay() public {
        assertFalse(guard.checkpoint()); vm.expectRevert(); guard.price();
        vm.warp(vm.getBlockTimestamp() + 60); assertFalse(guard.checkpoint()); // relay time alone cannot warm it
        fresh(2e6); assertTrue(guard.checkpoint()); assertEq(guard.price(), 2e6);
    }
    function testHealthyLiveMarkNotStaleCheckpointUsedForNAV() public {
        activate(); vm.warp(vm.getBlockTimestamp() + 60); fresh(2020000);
        assertEq(guard.price(), 2020000); assertEq(guard.markedValue(3e18), 6060000);
        assertTrue(guard.checkpoint()); assertEq(guard.acceptedPrice(), 2020000);
    }
    function testLargeMoveBlocksSharesAndNeedsStableRecovery() public {
        activate(); vm.warp(vm.getBlockTimestamp() + 60); fresh(3e6); vm.expectRevert(); guard.price();
        assertFalse(guard.checkpoint()); assertTrue(guard.quarantined());
        vm.warp(vm.getBlockTimestamp() + 59); fresh(3e6); assertFalse(guard.checkpoint()); vm.expectRevert(); guard.markedValue(1e18);
        vm.warp(vm.getBlockTimestamp() + 1); fresh(3e6); assertTrue(guard.checkpoint()); assertEq(guard.price(), 3e6);
    }
    function testUnstableRecoveryRestartsCandidate() public {
        activate(); vm.warp(vm.getBlockTimestamp() + 60); fresh(3e6); guard.checkpoint();
        vm.warp(vm.getBlockTimestamp() + 60); fresh(4e6); assertFalse(guard.checkpoint());
        vm.warp(vm.getBlockTimestamp() + 60); fresh(4e6); assertTrue(guard.checkpoint());
    }
    function testExpiredCheckpointCannotBeRefreshedInOneObservation() public {
        activate(); vm.warp(vm.getBlockTimestamp() + 301); fresh(2e6); vm.expectRevert(); guard.price();
        assertFalse(guard.checkpoint()); vm.warp(vm.getBlockTimestamp() + 60); fresh(2e6); assertTrue(guard.checkpoint());
    }
    function testSkewedFutureMissingAndStaleObservationsFail() public {
        activate(); source.set(2e6, uint64(vm.getBlockTimestamp() - 61)); vm.expectRevert(); guard.price();
        fresh(2e6); quote.set(vm.getBlockTimestamp() + 1); vm.expectRevert(); guard.price();
        quote.set(0); vm.expectRevert(); guard.checkpoint();
        quote.set(vm.getBlockTimestamp() - 301); vm.expectRevert(); guard.checkpoint();
    }
    function testUnderlyingValidationAndDependencyChangesRemainBlocking() public {
        activate(); source.fail(); vm.expectRevert(); guard.price();
        vm.etch(address(quote), hex"00"); vm.expectRevert(); guard.checkpoint();
    }
    function testEarlyCheckpointsCannotResetDriftAnchor() public { activate(); fresh(2e6); vm.expectRevert(); guard.checkpoint(); }
    function createShareFixture() external {
        cash = new GuardTokenFixture(6); position = new GuardTokenFixture(18);
        shareVault = new UnoraVault(IERC20(address(cash)), IERC20(address(position)), VaultValuationSource(address(guard)), address(this), address(99), bytes32(uint256(1)), bytes32(uint256(2)), 10e6, 50e6, 0, 1e6, keccak256("UNORA-VAULT-NAV-v1.0.0"));
        cash.mint(address(this), 2e6); cash.approve(address(shareVault), 2e6);
    }
    function testVaultShareIssuanceAndRedemptionFailClosedAcrossCircuitBreak() public {
        activate(); this.createShareFixture();
        uint256 shares = shareVault.deposit(1e6, address(this));
        vm.warp(vm.getBlockTimestamp() + 60); fresh(3e6);
        vm.expectRevert(); shareVault.previewDeposit(1e6);
        vm.expectRevert(); shareVault.deposit(1e6, address(this));
        vm.expectRevert(); shareVault.redeem(shares, address(this), address(this));
        assertEq(shareVault.totalSupply(), shares); assertEq(cash.balanceOf(address(shareVault)), 1e6);
        assertFalse(guard.checkpoint()); vm.warp(vm.getBlockTimestamp() + 60); fresh(3e6); assertTrue(guard.checkpoint());
        assertEq(shareVault.redeem(shares, address(this), address(this)), 1e6);
    }
    function testFuzzExposureValueUsesLivePriceAndExactDecimalUnits(uint96 balance) public { activate(); assertEq(guard.markedValue(balance), uint256(balance) * 2e6 / 1e18); }
}
