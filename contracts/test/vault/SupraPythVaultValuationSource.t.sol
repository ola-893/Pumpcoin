// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {SupraPythVaultValuationSource, IVaultSupra} from "../../src/vault/SupraPythVaultValuationSource.sol";
import {IVaultPyth} from "../../src/vault/PythVaultValuationSource.sol";

contract SupraProofFixture is IVaultSupra {
    function verifyOracleProofV2(bytes calldata proof) external pure returns (PriceInfo memory) {
        (bool valid, PriceInfo memory info) = abi.decode(proof, (bool, PriceInfo));
        require(valid, "invalid signature");
        return info;
    }
}
contract HybridPythFixture is IVaultPyth {
    Price public observation;
    function set(Price memory p) external { observation = p; }
    function getPriceUnsafe(bytes32) external view returns (Price memory) { return observation; }
}
contract HybridPoolFixture {
    uint160 public sqrt = 56022770974786139918731938227458171; // MON = 2 test-USDC
    uint128 public liquidity = 1000000000000000;
    function set(uint160 s, uint128 l) external { sqrt = s; liquidity = l; }
    function getSlot0(bytes32) external view returns (uint160, int24, uint24, uint24) { return (sqrt, 0, 0, 0); }
    function getLiquidity(bytes32) external view returns (uint128) { return liquidity; }
}
contract SupraPythVaultValuationSourceTest is Test {
    SupraPythVaultValuationSource source;
    SupraProofFixture supra;
    HybridPythFixture pyth;
    HybridPoolFixture pool;
    function setUp() public {
        vm.warp(1800000000);
        supra = new SupraProofFixture(); pyth = new HybridPythFixture(); pool = new HybridPoolFixture();
        pyth.set(IVaultPyth.Price(100000000, 1000, -8, block.timestamp));
        source = new SupraPythVaultValuationSource(address(supra), address(supra).codehash, address(pyth), bytes32(uint256(1)), address(pool), bytes32(uint256(2)));
    }
    function info() internal view returns (IVaultSupra.PriceInfo memory p) {
        p.pairs = new uint256[](2); p.prices = new uint256[](2); p.timestamp = new uint256[](2); p.decimal = new uint256[](2); p.round = new uint256[](2);
        p.pairs[0] = 569; p.pairs[1] = 48;
        p.prices[0] = 2e18; p.prices[1] = 1e8; p.decimal[0] = 18; p.decimal[1] = 8;
        p.timestamp[0] = block.timestamp * 1000; p.timestamp[1] = block.timestamp * 1000;
        p.round[0] = 1; p.round[1] = 1;
    }
    function relay(IVaultSupra.PriceInfo memory p) internal { source.updateMon(abi.encode(true, p)); }
    function testIndependentFeedsAndPool() public { relay(info()); assertEq(source.price(), 2e6); (bool ok,) = source.status(); assertTrue(ok); }
    function testUsdtAndUsdcDepegsAreValued() public {
        IVaultSupra.PriceInfo memory p = info(); p.prices[1] = 90e6; relay(p);
        pyth.set(IVaultPyth.Price(90e6, 1000, -8, block.timestamp)); assertEq(source.price(), 2e6);
    }
    function testRelayDoesNotRefreshPublicationTime() public {
        IVaultSupra.PriceInfo memory p = info(); p.timestamp[0] -= 200000; relay(p);
        (, uint64 at) = source.readMon(); assertEq(at, block.timestamp - 200);
        vm.warp(block.timestamp + 101); vm.expectRevert(); source.referencePrice();
    }
    function testInvalidSignatureRejected() public { vm.expectRevert("invalid signature"); source.updateMon(abi.encode(false, info())); }
    function testMissingDuplicateAndExtraPairsRejected() public {
        IVaultSupra.PriceInfo memory p = info(); p.pairs[1] = 569; vm.expectRevert(); relay(p);
        p = info(); p.pairs[0] = 1; vm.expectRevert(); relay(p);
        p = info(); p.prices = new uint256[](3); vm.expectRevert(); relay(p);
    }
    function testStaleFutureZeroAndDecimalsRejected() public {
        IVaultSupra.PriceInfo memory p = info(); p.timestamp[0] -= 301000; vm.expectRevert(); relay(p);
        p = info(); p.timestamp[0] += 1000; vm.expectRevert(); relay(p);
        p = info(); p.prices[0] = 0; vm.expectRevert(); relay(p);
        p = info(); p.decimal[0] = 19; vm.expectRevert(); relay(p);
    }
    function testRollbackAndReplayRejected() public { relay(info()); vm.expectRevert(); relay(info()); }
    function testOracleCodeChangeRejected() public { vm.etch(address(supra), hex"00"); vm.expectRevert(); relay(info()); }
    function testMissingAndStalePythFailClosed() public {
        relay(info()); pyth.set(IVaultPyth.Price(0, 0, -8, block.timestamp)); vm.expectRevert(); source.referencePrice();
        pyth.set(IVaultPyth.Price(1e8, 0, -8, block.timestamp - 301)); vm.expectRevert(); source.referencePrice();
    }
    function testPythConfidenceLimit() public { relay(info()); pyth.set(IVaultPyth.Price(1e8, 1000001, -8, block.timestamp)); vm.expectRevert(); source.price(); }
    function testLowLiquidityAndWrongPriceFailClosed() public {
        relay(info()); pool.set(pool.sqrt(), 1); vm.expectRevert(); source.price();
        pool.set(pool.sqrt() / 2, 1000000000000000); vm.expectRevert(); source.price();
    }
    function testFuzzNormalizesFeedDecimals(uint8 decimals) public {
        decimals = uint8(bound(decimals, 0, 18)); IVaultSupra.PriceInfo memory p = info();
        p.prices[0] = 2 * 10 ** uint256(decimals); p.decimal[0] = decimals; relay(p); assertEq(source.price(), 2e6);
    }
}
