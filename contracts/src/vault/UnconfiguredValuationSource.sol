// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Fail-closed valuation for a newly registered, unfunded vault.
/// @dev No invented price: deposits and trades remain unavailable until the
/// controller configures a real source through the vault's normal notice period.
contract UnconfiguredValuationSource {
    uint8 public immutable positionDecimals;
    bytes32 public constant REASON = keccak256("VALUATION_NOT_CONFIGURED");
    error ValuationNotConfigured();
    constructor(uint8 decimals_) { positionDecimals = decimals_; }
    function status() external pure returns (bool, bytes32) { return (false, REASON); }
    function price() external pure returns (uint256) { revert ValuationNotConfigured(); }
    function markedValue(uint256) external pure returns (uint256) { revert ValuationNotConfigured(); }
    function requireAvailable() external pure { revert ValuationNotConfigured(); }
}
