// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {ChainlinkVaultValuationSource} from "../../src/vault/ChainlinkVaultValuationSource.sol";
import {PoolStateFixture} from "./PythPoolGuard.t.sol";

contract ChainlinkAggregatorFixture {}

contract ChainlinkProxyFixture {
    address public aggregator;
    uint8 public decimals;
    string public description;
    uint80 public round = 1;
    int256 public answer;
    uint256 public started;
    uint256 public updated;
    uint80 public answered = 1;

    constructor(string memory name, uint8 scale) {
        description = name;
        decimals = scale;
        aggregator = address(new ChainlinkAggregatorFixture());
    }

    function set(int256 value, uint256 at) external {
        answer = value;
        started = at;
        updated = at;
    }

    function setRound(uint80 r, uint80 a, uint256 s) external {
        round = r;
        answered = a;
        started = s;
    }

    function setAggregator(address a) external {
        aggregator = a;
    }

    function setIdentity(string memory d, uint8 scale) external {
        description = d;
        decimals = scale;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (round, answer, started, updated, answered);
    }
}

contract ChainlinkVaultValuationSourceTest is Test {
    ChainlinkProxyFixture mon;
    ChainlinkProxyFixture usd;
    PoolStateFixture pool;
    ChainlinkVaultValuationSource source;
    uint160 constant SQRT = 56022770974786139918731938227458171;

    function feed(ChainlinkProxyFixture p) internal view returns (ChainlinkVaultValuationSource.Feed memory) {
        address a = p.aggregator();
        return ChainlinkVaultValuationSource.Feed(
            address(p), a, address(p).codehash, a.codehash, p.decimals()
        );
    }

    function setUp() public {
        vm.warp(1800000000);
        mon = new ChainlinkProxyFixture("MON / USD", 8);
        usd = new ChainlinkProxyFixture("USDC / USD", 6);
        mon.set(200000000, block.timestamp);
        usd.set(1000000, block.timestamp);
        pool = new PoolStateFixture();
        pool.set(SQRT, 1e15);
        source = new ChainlinkVaultValuationSource(feed(mon), feed(usd), address(pool), keccak256("pool"));
    }

    function unavailable() internal view {
        (bool ok,) = source.status();
        assertFalse(ok);
    }

    function testQuoteScalingAndPoolGuards() public {
        assertEq(source.referencePrice(), 2e6);
        assertEq(source.markedValue(3e18), 6e6);
        assertEq(source.updatedAt(), block.timestamp);
        pool.set(SQRT, 1);
        unavailable();
        vm.expectRevert();
        source.markedValue(1e18);
        pool.set(SQRT * 2, 1e15);
        unavailable();
        pool.set(0, 0);
        unavailable();
    }

    function testInvalidRoundsAndFreshnessFailClosed() public {
        mon.set(0, block.timestamp);
        unavailable();
        mon.set(-1, block.timestamp);
        unavailable();
        mon.set(200000000, block.timestamp + 1);
        unavailable();
        mon.set(200000000, block.timestamp - 301);
        unavailable();
        vm.expectRevert();
        source.updatedAt();
        mon.set(200000000, block.timestamp);
        mon.setRound(2, 1, block.timestamp);
        unavailable();
        mon.setRound(0, 0, block.timestamp);
        unavailable();
        mon.setRound(1, 1, block.timestamp + 1);
        unavailable();
        mon.setRound(1, 1, 0);
        unavailable();
        mon.setRound(1, 1, block.timestamp);
        usd.set(1000000, block.timestamp - 301);
        unavailable();
    }

    function testFeedIdentityAndUpgradesFailClosed() public {
        mon.setAggregator(address(new ChainlinkAggregatorFixture()));
        unavailable();
        ChainlinkVaultValuationSource.Feed memory u = feed(usd);
        ChainlinkVaultValuationSource.Feed memory m = feed(mon);
        vm.expectRevert();
        new ChainlinkVaultValuationSource(u, m, address(pool), keccak256("pool"));
        mon.setIdentity("MON / USD", 19);
        m = feed(mon);
        vm.expectRevert();
        new ChainlinkVaultValuationSource(m, u, address(pool), keccak256("pool"));
    }

    function testMetadataAndCodeMutationFailClosed() public {
        mon.setIdentity("ETH / USD", 8);
        unavailable();
        mon.setIdentity("MON / USD", 7);
        unavailable();
        mon.setIdentity("MON / USD", 8);
        vm.etch(usd.aggregator(), hex"60006000fd");
        unavailable();
    }

    function testFuzzMixedDecimalConversion(uint64 value) public {
        value = uint64(bound(value, 10000, 1e14));
        mon.set(int256(uint256(value)), block.timestamp);
        assertEq(source.referencePrice(), uint256(value) / 100);
    }
}
