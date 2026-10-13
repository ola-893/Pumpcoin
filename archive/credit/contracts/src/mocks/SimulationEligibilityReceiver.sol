// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AttestationRegistry, EligibilityReport} from "../AttestationRegistry.sol";

/// @notice TEST ONLY: local CRE simulation has no authenticated workflow metadata.
/// @dev An operator approves each exact report. This is NOT decentralized oracle security.
contract SimulationEligibilityReceiver {
    AttestationRegistry public immutable registry;
    address public immutable forwarder;
    address public immutable operator;
    mapping(bytes32 => bool) public approvedReports;
    error UnauthorizedReport();
    error WrongDestination();
    event ReportApproval(bytes32 indexed digest, bool approved);

    constructor(AttestationRegistry registry_, address forwarder_, address operator_) {
        require(block.chainid == 31337 || block.chainid == 10143, "test chains only");
        require(
            address(registry_).code.length > 0 && forwarder_ != address(0) && operator_ != address(0), "invalid pins"
        );
        registry = registry_;
        forwarder = forwarder_;
        operator = operator_;
    }

    function approveReport(bytes32 digest, bool approved) external {
        if (msg.sender != operator || digest == bytes32(0)) revert UnauthorizedReport();
        approvedReports[digest] = approved;
        emit ReportApproval(digest, approved);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == this.onReport.selector || id == 0x01ffc9a7;
    }

    function onReport(bytes calldata, bytes calldata report) external {
        bytes32 digest = keccak256(report);
        if (msg.sender != forwarder || !approvedReports[digest]) revert UnauthorizedReport();
        (uint256 chainId, address destination, EligibilityReport memory result) =
            abi.decode(report, (uint256, address, EligibilityReport));
        if (chainId != block.chainid || destination != address(registry)) revert WrongDestination();
        delete approvedReports[digest];
        registry.submitEligibility(result);
    }
}
