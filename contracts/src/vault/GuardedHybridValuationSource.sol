// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IVaultPyth} from "./PythVaultValuationSource.sol";

interface IHybridMark {
    function price() external view returns (uint256);
    function readMon() external view returns (uint256, uint64);
    function updatedAt() external view returns (uint64);
    function pyth() external view returns (address);
    function quoteFeed() external view returns (bytes32);
    function stateView() external view returns (address);
    function poolId() external view returns (bytes32);
}

/// @notice A separate, explicitly governed wrapper for existing Supra/Pyth marks.
/// @dev Adds feed alignment, dependency pins and a delayed circuit-breaker recovery.
/// Checkpoints are not a second independent oracle, a TWAP, or a guarantee of fair value.
contract GuardedHybridValuationSource {
    uint8 public constant positionDecimals = 18;
    uint64 public constant maxStaleness = 300;
    uint64 public constant maxFeedSkew = 60;
    uint64 public constant sampleDelay = 60;
    uint16 public constant maxChangeBps = 300;
    uint16 public constant recoveryToleranceBps = 100;
    IHybridMark public immutable underlying;
    bytes32 public immutable underlyingCodeHash;
    address public immutable pyth;
    bytes32 public immutable pythCodeHash;
    address public immutable stateView;
    bytes32 public immutable stateViewCodeHash;
    bytes32 public immutable poolId;
    bytes32 public immutable quoteFeed;
    uint256 public acceptedPrice;
    uint64 public acceptedAt;
    uint64 public acceptedPublication;
    uint256 public candidatePrice;
    uint64 public candidateAt;
    uint64 public candidatePublication;
    bool public quarantined;
    error Unavailable();
    event CandidateObserved(uint256 price, uint64 publishedAt, uint64 observedAt);
    event CheckpointAccepted(uint256 price, uint64 publishedAt, uint64 observedAt);

    constructor(address source, bytes32 sourceHash, bytes32 pythHash, bytes32 stateHash) {
        require(source.code.length > 0 && source.codehash == sourceHash, "source pin");
        underlying = IHybridMark(source); underlyingCodeHash = sourceHash;
        pyth = IHybridMark(source).pyth(); pythCodeHash = pythHash;
        stateView = IHybridMark(source).stateView(); stateViewCodeHash = stateHash;
        poolId = IHybridMark(source).poolId(); quoteFeed = IHybridMark(source).quoteFeed();
        require(pyth.code.length > 0 && pyth.codehash == pythHash && stateView.code.length > 0 && stateView.codehash == stateHash, "dependency pins");
    }

    function _observation() internal view returns (uint256 mark, uint64 at) {
        // Proxy implementation storage cannot be read by another contract. Oracle
        // governance remains a trust boundary; the keeper checks the slot off-chain.
        if (address(underlying).codehash != underlyingCodeHash || pyth.codehash != pythCodeHash || stateView.codehash != stateViewCodeHash) revert Unavailable();
        (, uint64 monAt) = underlying.readMon();
        IVaultPyth.Price memory quote = IVaultPyth(pyth).getPriceUnsafe(quoteFeed);
        uint256 quoteAt = quote.publishTime;
        if (monAt == 0 || quoteAt == 0 || monAt > block.timestamp || quoteAt > block.timestamp || block.timestamp - monAt > maxStaleness || block.timestamp - quoteAt > maxStaleness || (monAt > quoteAt ? monAt - quoteAt : quoteAt - monAt) > maxFeedSkew) revert Unavailable();
        mark = underlying.price(); // Includes signature-derived data, confidence, liquidity and spot checks.
        at = uint64(monAt < quoteAt ? monAt : quoteAt);
        if (mark == 0) revert Unavailable();
    }
    function _within(uint256 a, uint256 b, uint16 limit) internal pure returns (bool) {
        return b != 0 && Math.mulDiv(a > b ? a - b : b - a, 10000, b, Math.Rounding.Ceil) <= limit;
    }
    function checkpoint() external returns (bool accepted) {
        (uint256 mark, uint64 publication) = _observation();
        if (publication <= acceptedPublication || block.timestamp < uint256(acceptedAt) + sampleDelay) revert Unavailable();
        if (!quarantined && acceptedPrice != 0 && block.timestamp <= uint256(acceptedAt) + maxStaleness && _within(mark, acceptedPrice, maxChangeBps)) {
            return _accept(mark, publication);
        }
        // First activation or an abrupt change needs two advancing observations
        // at least one minute apart, with no administrator price override.
        quarantined = true;
        if (candidatePrice != 0 && block.timestamp >= uint256(candidateAt) + sampleDelay && publication >= uint256(candidatePublication) + sampleDelay && _within(mark, candidatePrice, recoveryToleranceBps)) {
            return _accept(mark, publication);
        }
        if (candidatePrice == 0 || !_within(mark, candidatePrice, recoveryToleranceBps)) {
            candidatePrice = mark; candidateAt = uint64(block.timestamp); candidatePublication = publication;
            emit CandidateObserved(mark, publication, uint64(block.timestamp));
        }
        return false;
    }
    function _accept(uint256 mark, uint64 publication) internal returns (bool) {
        acceptedPrice = mark; acceptedAt = uint64(block.timestamp); acceptedPublication = publication;
        candidatePrice = 0; candidateAt = 0; candidatePublication = 0; quarantined = false;
        emit CheckpointAccepted(mark, publication, uint64(block.timestamp)); return true;
    }
    function price() public view returns (uint256 mark) {
        (mark,) = _observation();
        if (quarantined || acceptedPrice == 0 || block.timestamp - acceptedAt > maxStaleness || !_within(mark, acceptedPrice, maxChangeBps)) revert Unavailable();
    }
    function updatedAt() external view returns (uint64) { price(); (, uint64 at) = _observation(); return at; }
    function markedValue(uint256 balance) external view returns (uint256) { return Math.mulDiv(balance, price(), 1e18); }
    function requireAvailable() external view { price(); }
    function status() external view returns (bool, bytes32) { try this.price() returns (uint256) { return (true, bytes32(0)); } catch { return (false, keccak256("GUARDED_HYBRID_UNAVAILABLE")); } }
}
