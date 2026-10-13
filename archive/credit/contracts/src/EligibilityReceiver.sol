// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AttestationRegistry, EligibilityReport} from "./AttestationRegistry.sol";

/// @notice CRE transport adapter. Workflow ID may be pinned once after deployment.
/// @dev A simulation/mock forwarder offers NO DON security. Never use it with real funds.
contract EligibilityReceiver {
    AttestationRegistry public immutable registry;
    address public immutable forwarder;
    bytes32 public workflowId;
    address public immutable workflowOwner;
    error UnauthorizedReport();
    error WrongDestination();

    constructor(AttestationRegistry registry_, address forwarder_, bytes32 workflowId_, address owner_) {
        if (address(registry_).code.length == 0 || forwarder_ == address(0) || owner_ == address(0)) {
            revert UnauthorizedReport();
        }
        registry = registry_;
        forwarder = forwarder_;
        workflowId = workflowId_;
        workflowOwner = owner_;
    }

    /// @dev Breaks the config/address dependency cycle. Reports are disabled until pinned.
    function pinWorkflowId(bytes32 id) external {
        if (msg.sender != registry.rootController() || workflowId != bytes32(0) || id == bytes32(0)) {
            revert UnauthorizedReport();
        }
        workflowId = id;
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == this.onReport.selector || id == 0x01ffc9a7;
    }

    function onReport(bytes calldata metadata, bytes calldata report) external {
        // CRE metadata: workflow ID (32), workflow name (10), workflow owner (20).
        // Production adds a two-byte report ID. Local MockForwarder lacks identity metadata;
        // use the separate operator-approved SimulationEligibilityReceiver for that path.
        if (workflowId == bytes32(0) || msg.sender != forwarder || (metadata.length != 62 && metadata.length != 64)) {
            revert UnauthorizedReport();
        }
        if (bytes32(metadata[:32]) != workflowId || address(bytes20(metadata[42:62])) != workflowOwner) {
            revert UnauthorizedReport();
        }
        (uint256 chainId, address destination, EligibilityReport memory result) =
            abi.decode(report, (uint256, address, EligibilityReport));
        if (chainId != block.chainid || destination != address(registry)) revert WrongDestination();
        registry.submitEligibility(result);
    }
}
