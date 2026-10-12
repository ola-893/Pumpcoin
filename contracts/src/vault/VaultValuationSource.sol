// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Documented valuation source for the Unora investment vault vertical slice.
/// @dev Simulation fixture: admin-updated marked price, NOT a live price feed.
/// NAV policy v1: price has 18 decimals (quote per asset, 1e18 = 1:1).
/// Valuation is AVAILABLE only when: not disputed, position data available,
/// price != 0 and block.timestamp - updatedAt <= maxStaleness.
/// Stale/missing/manipulated price or unavailable position data MUST block
/// share transactions (OWN-04). Views revert rather than fabricate a price.
contract VaultValuationSource {
    uint8 public constant positionDecimals = 6;
    address public admin;
    uint256 public price; // 18 decimals, quote per 1 asset unit
    uint64 public updatedAt;
    uint64 public immutable maxStaleness;
    bool public disputed;
    bool public positionDataAvailable;

    error NotAdmin();
    error ZeroPrice();
    error ValuationUnavailable(bytes32 reason);

    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event PriceUpdated(uint256 price, uint64 updatedAt);
    event MaxStalenessUpdated(uint64 maxStaleness);
    event Disputed(address indexed by);
    event DisputeResolved(address indexed by);
    event PositionDataUpdated(bool available);

    bytes32 public constant REASON_STALE = keccak256("STALE");
    bytes32 public constant REASON_MISSING = keccak256("MISSING");
    bytes32 public constant REASON_DISPUTED = keccak256("DISPUTED");
    bytes32 public constant REASON_POSITION_UNAVAILABLE = keccak256("POSITION_UNAVAILABLE");

    constructor(address admin_, uint256 initialPrice, uint64 maxStaleness_) {
        require(admin_ != address(0), "admin");
        require(initialPrice != 0, "price");
        require(maxStaleness_ != 0, "freshness");
        admin = admin_;
        price = initialPrice;
        updatedAt = uint64(block.timestamp);
        maxStaleness = maxStaleness_;
        positionDataAvailable = true;
        emit PriceUpdated(initialPrice, uint64(block.timestamp));
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    function setAdmin(address next) external onlyAdmin {
        require(next != address(0), "admin");
        emit AdminChanged(admin, next);
        admin = next;
    }

    function updatePrice(uint256 next) external onlyAdmin {
        if (next == 0) revert ZeroPrice();
        price = next;
        updatedAt = uint64(block.timestamp);
        emit PriceUpdated(next, uint64(block.timestamp));
    }

    function dispute() external onlyAdmin {
        disputed = true;
        emit Disputed(msg.sender);
    }

    function resolveDispute(uint256 next) external onlyAdmin {
        if (next == 0) revert ZeroPrice();
        disputed = false;
        price = next;
        updatedAt = uint64(block.timestamp);
        emit DisputeResolved(msg.sender);
        emit PriceUpdated(next, uint64(block.timestamp));
    }

    function setPositionDataAvailable(bool v) external onlyAdmin {
        positionDataAvailable = v;
        emit PositionDataUpdated(v);
    }

    /// @notice (available, reason). reason is 0 when available.
    function status() public view returns (bool available, bytes32 reason) {
        if (disputed) return (false, REASON_DISPUTED);
        if (!positionDataAvailable) return (false, REASON_POSITION_UNAVAILABLE);
        if (price == 0) return (false, REASON_MISSING);
        if (block.timestamp > uint256(updatedAt) + uint256(maxStaleness)) {
            return (false, REASON_STALE);
        }
        return (true, bytes32(0));
    }

    function requireAvailable() public view {
        (bool ok, bytes32 reason) = status();
        if (!ok) revert ValuationUnavailable(reason);
    }

    /// @notice Marked quote value of a position balance (both tokens 6 decimals).
    function markedValue(uint256 positionBalance) external view returns (uint256) {
        requireAvailable();
        return Math.mulDiv(positionBalance, price, 1e18);
    }
}
