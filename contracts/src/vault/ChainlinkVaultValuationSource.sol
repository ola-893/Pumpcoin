// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @dev Standard Chainlink AggregatorV3 read interface; proxy exposes aggregator().
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

interface IChainlinkProxy is AggregatorV3Interface {
    function aggregator() external view returns (address);
}

interface IChainlinkPoolState {
    function getSlot0(bytes32) external view returns (uint160, int24, uint24, uint24);
    function getLiquidity(bytes32) external view returns (uint128);
}

/// @notice Read-only MON/USD divided by USDC/USD. No key, cached mark or price setter.
/// @dev Test token reference valuation, not a USD redemption promise. Feed upgrades
/// require reviewed replacement infrastructure through the vault's normal notice.
contract ChainlinkVaultValuationSource {
    struct Feed {
        address proxy;
        address aggregator;
        bytes32 proxyCodeHash;
        bytes32 aggregatorCodeHash;
        uint8 decimals;
    }
    uint8 public constant positionDecimals = 18;
    uint64 public constant maxStaleness = 300;
    uint16 public constant maxDeviationBps = 500;
    uint256 public constant minimumQuoteLiquidity = 100e6;
    // Written only by the constructor; no external mutation functions.
    Feed public monFeed;
    Feed public usdFeed;
    IChainlinkPoolState public immutable stateView;
    bytes32 public immutable poolId;
    error Unavailable();

    constructor(Feed memory mon, Feed memory usd, address state, bytes32 pool) {
        require(mon.proxy != usd.proxy && state.code.length > 0 && pool != bytes32(0), "feeds");
        _identity(mon, keccak256("MON / USD"));
        _identity(usd, keccak256("USDC / USD"));
        monFeed = mon;
        usdFeed = usd;
        stateView = IChainlinkPoolState(state);
        poolId = pool;
    }

    function _identity(Feed memory f, bytes32 descriptionHash) internal view {
        if (
            f.proxy.code.length == 0 || f.aggregator.code.length == 0 || f.decimals > 18
                || f.proxy.codehash != f.proxyCodeHash || f.aggregator.codehash != f.aggregatorCodeHash
                || IChainlinkProxy(f.proxy).aggregator() != f.aggregator
                || IChainlinkProxy(f.proxy).decimals() != f.decimals
                || keccak256(bytes(IChainlinkProxy(f.proxy).description())) != descriptionHash
        ) revert Unavailable();
    }

    function _read(Feed memory f, bytes32 descriptionHash) internal view returns (uint256 value, uint256 at) {
        _identity(f, descriptionHash);
        (uint80 round, int256 answer, uint256 started, uint256 updated, uint80 answered) =
            IChainlinkProxy(f.proxy).latestRoundData();
        if (
            round == 0 || answered < round || answer <= 0 || started == 0 || started > updated || updated == 0
                || updated > block.timestamp || block.timestamp - updated > maxStaleness
        ) {
            revert Unavailable();
        }
        // Bound multiplication to a representable 18-decimal value.
        value = uint256(answer) * 10 ** (18 - f.decimals);
        at = updated;
    }

    function referencePrice() public view returns (uint256 mark) {
        (uint256 mon,) = _read(monFeed, keccak256("MON / USD"));
        (uint256 usd,) = _read(usdFeed, keccak256("USDC / USD"));
        // Quote base units per 1e18 WMON units; MON=2 USDC yields 2e6.
        mark = Math.mulDiv(mon, 1e6, usd);
        if (mark == 0) revert Unavailable();
    }

    function price() public view returns (uint256 mark) {
        mark = referencePrice();
        (uint160 sqrt,,,) = stateView.getSlot0(poolId);
        if (sqrt == 0) revert Unavailable();
        uint256 ratio = Math.mulDiv(sqrt, sqrt, 1 << 64);
        if (ratio == 0) revert Unavailable();
        uint256 spot = Math.mulDiv(1 << 128, 1e18, ratio);
        uint256 delta = spot > mark ? spot - mark : mark - spot;
        if (
            Math.mulDiv(delta, 10000, mark, Math.Rounding.Ceil) > maxDeviationBps
                || Math.mulDiv(stateView.getLiquidity(poolId), 1 << 96, sqrt) < minimumQuoteLiquidity
        ) {
            revert Unavailable();
        }
    }

    function updatedAt() external view returns (uint64) {
        (, uint256 a) = _read(monFeed, keccak256("MON / USD"));
        (, uint256 b) = _read(usdFeed, keccak256("USDC / USD"));
        return uint64(a < b ? a : b);
    }

    function markedValue(uint256 balance) external view returns (uint256) {
        return Math.mulDiv(balance, price(), 1e18);
    }

    function requireAvailable() external view {
        price();
    }

    function status() external view returns (bool, bytes32) {
        try this.price() returns (uint256) {
            return (true, bytes32(0));
        }
            catch {
            return (false, keccak256("CHAINLINK_UNAVAILABLE"));
        }
    }
}
