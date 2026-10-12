// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IVaultPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }
    function getPriceUnsafe(bytes32 id) external view returns (Price memory);
}

/// @notice Immutable MON/USD / USDC/USD valuation for a 6-decimal quote and 18-decimal WMON.
/// @dev Testnet reference valuation, not a claim that test tokens redeem for USD.
/// Anyone can update the underlying Pyth contract with authenticated updates.
/// No administrator can inject a mark. Missing, future, stale, uncertain or
/// out-of-range feed values fail closed. No cached price survives a stale feed.
contract PythVaultValuationSource {
    uint8 public constant positionDecimals = 18;
    IVaultPyth public immutable pyth;
    bytes32 public immutable positionFeed;
    bytes32 public immutable quoteFeed;
    uint64 public immutable maxStaleness;
    uint16 public immutable maxConfidenceBps;
    error Unavailable();

    constructor(address oracle, bytes32 positionId, bytes32 quoteId, uint64 freshness, uint16 confidence) {
        require(
            oracle.code.length > 0 && positionId != bytes32(0) && quoteId != bytes32(0)
                && positionId != quoteId,
            "feeds"
        );
        require(freshness > 0 && freshness <= 1 hours && confidence > 0 && confidence <= 100, "limits");
        pyth = IVaultPyth(oracle);
        positionFeed = positionId;
        quoteFeed = quoteId;
        maxStaleness = freshness;
        maxConfidenceBps = confidence;
    }

    function _usd(IVaultPyth.Price memory p) internal view returns (uint256) {
        if (
            p.price <= 0 || p.publishTime == 0 || p.publishTime > block.timestamp
                || block.timestamp - p.publishTime > maxStaleness || p.expo < -18 || p.expo > 0
                || uint256(p.conf) * 10000 > uint256(uint64(p.price)) * maxConfidenceBps
        ) revert Unavailable();
        return uint256(uint64(p.price)) * 10 ** uint32(18 + p.expo);
    }

    /// @notice Quote base units per 1e18 position base units. At MON=2 USDC,
    /// price=2e6, NOT 2e18. This matches the already-deployed vault's sell cap math.
    function price() public view virtual returns (uint256 result) {
        uint256 mon = _usd(pyth.getPriceUnsafe(positionFeed));
        uint256 usd = _usd(pyth.getPriceUnsafe(quoteFeed));
        result = Math.mulDiv(mon, 1e6, usd);
        if (result == 0) revert Unavailable();
    }

    function updatedAt() external view returns (uint64) {
        uint256 a = pyth.getPriceUnsafe(positionFeed).publishTime;
        uint256 b = pyth.getPriceUnsafe(quoteFeed).publishTime;
        return uint64(a < b ? a : b);
    }

    function status() external view returns (bool, bytes32) {
        try this.price() returns (uint256) {
            return (true, bytes32(0));
        }
            catch {
            return (false, keccak256("PYTH_UNAVAILABLE"));
        }
    }

    function requireAvailable() external view {
        price();
    }

    function markedValue(uint256 balance) external view returns (uint256) {
        return Math.mulDiv(balance, price(), 1e18);
    }
}

interface IVaultPoolState {
    function getSlot0(bytes32) external view returns (uint160, int24, uint24, uint24);
    function getLiquidity(bytes32) external view returns (uint128);
}

/// @notice Deposits and trades also fail when the chosen testnet pool materially
/// disagrees with the independent mark or lacks the declared active liquidity.
/// The virtual-reserve threshold is a screen, not a guarantee of executable size.
contract DexCheckedPythVaultValuationSource is PythVaultValuationSource {
    IVaultPoolState public immutable stateView;
    bytes32 public immutable poolId;
    uint16 public immutable maxDeviationBps;
    uint256 public immutable minimumQuoteLiquidity;

    constructor(
        address oracle,
        bytes32 mon,
        bytes32 usd,
        uint64 freshness,
        uint16 confidence,
        address state,
        bytes32 pool,
        uint16 deviation,
        uint256 liquidity
    ) PythVaultValuationSource(oracle, mon, usd, freshness, confidence) {
        require(
            state.code.length > 0 && pool != bytes32(0) && deviation > 0 && deviation <= 500 && liquidity > 0,
            "pool policy"
        );
        stateView = IVaultPoolState(state);
        poolId = pool;
        maxDeviationBps = deviation;
        minimumQuoteLiquidity = liquidity;
    }

    function price() public view override returns (uint256 mark) {
        mark = super.price();
        (uint160 sqrtPrice,,,) = stateView.getSlot0(poolId);
        if (sqrtPrice == 0) revert Unavailable();
        uint256 ratioX128 = Math.mulDiv(sqrtPrice, sqrtPrice, 1 << 64);
        if (ratioX128 == 0) revert Unavailable();
        uint256 spot = Math.mulDiv(1 << 128, 1e18, ratioX128);
        uint256 delta = spot > mark ? spot - mark : mark - spot;
        if (
            Math.mulDiv(delta, 10000, mark, Math.Rounding.Ceil) > maxDeviationBps
                || Math.mulDiv(stateView.getLiquidity(poolId), 1 << 96, sqrtPrice) < minimumQuoteLiquidity
        ) revert Unavailable();
    }
}
