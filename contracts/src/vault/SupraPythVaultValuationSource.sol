// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVaultPyth, IVaultPoolState} from "./PythVaultValuationSource.sol";

interface IVaultSupra {
    struct PriceInfo {
        uint256[] pairs;
        uint256[] prices;
        uint256[] timestamp;
        uint256[] decimal;
        uint256[] round;
    }
    function verifyOracleProofV2(bytes calldata proof) external returns (PriceInfo memory);
}

/// @notice Verified Supra MON/USDT * USDT/USD, divided by independent Pyth USDC/USD.
/// @dev Anyone may relay proofs; no owner or model can supply an unsigned mark.
/// Stored MON data retains the signed publication time, never the relay time.
/// Supra has no Pyth-style confidence interval; the 1% confidence limit applies to Pyth USDC.
contract SupraPythVaultValuationSource is ReentrancyGuard {
    uint8 public constant positionDecimals = 18;
    uint64 public constant maxStaleness = 300;
    uint16 public constant maxConfidenceBps = 100;
    uint16 public constant maxDeviationBps = 500;
    uint256 public constant minimumQuoteLiquidity = 100e6;
    IVaultSupra public immutable supra;
    bytes32 public immutable supraCodeHash;
    IVaultPyth public immutable pyth;
    bytes32 public immutable quoteFeed;
    IVaultPoolState public immutable stateView;
    bytes32 public immutable poolId;
    uint256 public monUsd;
    uint64 public monPublishedAtMs;
    error Unavailable();
    event MonPriceUpdated(uint256 usd18, uint64 publishedAtMs);

    constructor(address supra_, bytes32 supraHash, address pyth_, bytes32 usdFeed, address state, bytes32 pool) {
        require(supra_.code.length > 0 && supra_.codehash == supraHash, "supra code");
        require(pyth_.code.length > 0 && usdFeed != bytes32(0), "pyth feed");
        require(state.code.length > 0 && pool != bytes32(0), "pool");
        supra = IVaultSupra(supra_);
        supraCodeHash = supraHash;
        pyth = IVaultPyth(pyth_);
        quoteFeed = usdFeed;
        stateView = IVaultPoolState(state);
        poolId = pool;
    }

    function updateMon(bytes calldata proof) external nonReentrant {
        if (address(supra).codehash != supraCodeHash || proof.length == 0 || proof.length > 65536) revert Unavailable();
        IVaultSupra.PriceInfo memory p = supra.verifyOracleProofV2(proof);
        if (p.pairs.length != 2 || p.prices.length != 2 || p.timestamp.length != 2 || p.decimal.length != 2 || p.round.length != 2) revert Unavailable();
        uint256 mon;
        uint256 usdt;
        uint256 oldest = type(uint64).max;
        for (uint256 i; i < 2; ++i) {
            uint256 at = p.timestamp[i] / 1000; // Supra V2 publishes milliseconds.
            if (p.prices[i] == 0 || p.decimal[i] > 18 || at == 0 || at > block.timestamp || block.timestamp - at > maxStaleness || p.timestamp[i] > type(uint64).max || p.round[i] == 0) revert Unavailable();
            uint256 normalized = p.prices[i] * 10 ** (18 - p.decimal[i]);
            if (p.pairs[i] == 569 && mon == 0) mon = normalized;
            else if (p.pairs[i] == 48 && usdt == 0) usdt = normalized;
            else revert Unavailable();
            if (p.timestamp[i] < oldest) oldest = p.timestamp[i];
        }
        if (mon == 0 || usdt == 0 || oldest <= monPublishedAtMs) revert Unavailable();
        uint256 mark = Math.mulDiv(mon, usdt, 1e18);
        if (mark == 0) revert Unavailable();
        monUsd = mark;
        monPublishedAtMs = uint64(oldest);
        emit MonPriceUpdated(mark, uint64(oldest));
    }

    function readMon() public view returns (uint256 value, uint64 publishedAt) {
        return (monUsd, monPublishedAtMs / 1000);
    }

    function _quote() internal view returns (uint256 value, uint256 at) {
        IVaultPyth.Price memory p = pyth.getPriceUnsafe(quoteFeed);
        if (p.price <= 0 || p.publishTime == 0 || p.publishTime > block.timestamp || block.timestamp - p.publishTime > maxStaleness || p.expo < -18 || p.expo > 0 || uint256(p.conf) * 10000 > uint256(uint64(p.price)) * maxConfidenceBps) revert Unavailable();
        return (uint256(uint64(p.price)) * 10 ** uint32(18 + p.expo), p.publishTime);
    }

    function referencePrice() public view returns (uint256 mark) {
        (uint256 mon, uint64 at) = readMon();
        if (address(supra).codehash != supraCodeHash || mon == 0 || at == 0 || at > block.timestamp || block.timestamp - at > maxStaleness) revert Unavailable();
        (uint256 usd,) = _quote();
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
        if (Math.mulDiv(delta, 10000, mark, Math.Rounding.Ceil) > maxDeviationBps || Math.mulDiv(stateView.getLiquidity(poolId), 1 << 96, sqrt) < minimumQuoteLiquidity) revert Unavailable();
    }
    function updatedAt() external view returns (uint64) {
        referencePrice();
        (, uint256 usdAt) = _quote();
        uint64 monAt = monPublishedAtMs / 1000;
        return uint64(monAt < usdAt ? monAt : usdAt);
    }
    function markedValue(uint256 balance) external view returns (uint256) { return Math.mulDiv(balance, price(), 1e18); }
    function requireAvailable() external view { price(); }
    function status() external view returns (bool, bytes32) {
        try this.price() returns (uint256) { return (true, bytes32(0)); }
        catch { return (false, keccak256("SUPRA_PYTH_UNAVAILABLE")); }
    }
}
