// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IChronicleMark {
    function tryReadWithAge() external view returns (bool, uint256, uint256);
    function decimals() external view returns (uint8);
    function wat() external view returns (bytes32);
}
interface ISelfKiss {
    function selfKiss(address oracle) external;
}
interface IChroniclePool {
    function getSlot0(bytes32) external view returns (uint160, int24, uint24, uint24);
    function getLiquidity(bytes32) external view returns (uint128);
}

/// @notice Independent push feeds: no off-chain key, price setter, cached mark,
/// or subscription. Testnet USD reference is not a redemption promise.
contract ChronicleVaultValuationSource {
    uint8 public constant positionDecimals = 18;
    uint64 public constant maxStaleness = 300;
    uint16 public constant maxDeviationBps = 500;
    uint256 public constant minimumQuoteLiquidity = 100e6;
    IChronicleMark public immutable monOracle;
    IChronicleMark public immutable usdOracle;
    IChroniclePool public immutable stateView;
    bytes32 public immutable poolId;
    error Unavailable();

    constructor(address mon, address usd, address kisser, address state, bytes32 pool) {
        require(mon != usd && mon.code.length > 0 && usd.code.length > 0 && kisser.code.length > 0 && state.code.length > 0 && pool != bytes32(0), "code");
        monOracle = IChronicleMark(mon);
        usdOracle = IChronicleMark(usd);
        require(monOracle.decimals() == 18 && usdOracle.decimals() == 18, "decimals");
        require(monOracle.wat() == bytes32("MON/USD") && usdOracle.wat() == bytes32("USDC/USD"), "feeds");
        ISelfKiss(kisser).selfKiss(mon);
        ISelfKiss(kisser).selfKiss(usd);
        stateView = IChroniclePool(state);
        poolId = pool;
    }
    function _read(IChronicleMark feed) internal view returns (uint256 value, uint256 age) {
        bool ok;
        (ok, value, age) = feed.tryReadWithAge();
        if (!ok || value == 0 || age == 0 || age > block.timestamp || block.timestamp - age > maxStaleness) revert Unavailable();
    }
    function referencePrice() public view returns (uint256 mark) {
        (uint256 mon,) = _read(monOracle);
        (uint256 usd,) = _read(usdOracle);
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
        (,uint256 a) = _read(monOracle);
        (,uint256 b) = _read(usdOracle);
        return uint64(a < b ? a : b);
    }
    function markedValue(uint256 balance) external view returns (uint256) { return Math.mulDiv(balance, price(), 1e18); }
    function requireAvailable() external view { price(); }
    function status() external view returns (bool, bytes32) {
        try this.price() returns (uint256) { return (true, bytes32(0)); }
        catch { return (false, keccak256("CHRONICLE_UNAVAILABLE")); }
    }
}

/// @dev Read-only eth_call constructor probe. Returns feed data without
/// persisting a deployment or access-list change.
contract ChronicleReadProbe {
    constructor(address mon, address usd, address kisser) {
        ISelfKiss(kisser).selfKiss(mon);
        ISelfKiss(kisser).selfKiss(usd);
        (bool a,uint256 m,uint256 ma)=IChronicleMark(mon).tryReadWithAge();
        (bool b,uint256 u,uint256 ua)=IChronicleMark(usd).tryReadWithAge();
        bytes memory result=abi.encode(a,m,ma,b,u,ua,IChronicleMark(mon).wat(),IChronicleMark(usd).wat());
        assembly { return(add(result,32),mload(result)) }
    }
}
