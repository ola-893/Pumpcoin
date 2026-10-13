// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

enum DataSourceType {
    PAYMENT_PROCESSOR_REVENUE,
    GIG_PLATFORM_EARNINGS,
    REMITTANCE_HISTORY
}

enum Tier {
    NONE,
    TIER_1,
    TIER_2,
    TIER_3
}

struct Attestation {
    DataSourceType sourceType;
    Tier tier;
    uint64 issuedAt;
    uint64 expiresAt;
    bytes32 proofHash;
}

/// @dev Public output only: no raw account ID, payout amount, or proof body.
struct EligibilityReport {
    address subject;
    bytes32 sourceId;
    bytes32 proofHash;
    bytes32 sessionId;
    bytes32 policyVersion;
    Tier tier;
    uint64 observedAt;
    uint64 expiresAt;
    uint256 ceiling;
}

/// @notice Stores an oracle's assessment, not raw financial data or a verified ZK proof.
/// @dev One active credential per wallet. This registry does not establish unique personhood.
contract AttestationRegistry {
    uint64 public constant MAX_VALIDITY = 30 days;
    address public immutable rootController;
    address public oracle;
    mapping(address subject => Attestation) public attestations;
    mapping(bytes32 proofHash => bool) public usedProofHashes;
    // V1 is a test-token policy, not underwriting or proof of unique personhood.
    bytes32 public constant POLICY_VERSION = keccak256("proofline:payout-policy:v1:test-tokens");
    bool public evidenceMode;
    address public positionController;
    mapping(address => EligibilityReport) public eligibility;
    mapping(bytes32 => address) public sourceOwner;
    mapping(address => bytes32) public sourceOf;
    mapping(bytes32 => bool) public usedSessions;
    mapping(address => bool) public retiredWallet;
    mapping(bytes32 => uint64) public latestObservation;

    error ZeroAddress();
    error NotOracle();
    error NotRoot();
    error InvalidTier();
    error InvalidExpiry();
    error InvalidProofHash();
    error ProofAlreadyUsed();
    error EvidenceRequired();
    error InvalidEvidence();
    error SourceAlreadyBound();
    error SessionAlreadyUsed();
    error InvalidMigration();

    event EvidenceModeEnabled(address indexed positionController);
    event EligibilityAccepted(
        address indexed subject, bytes32 indexed sourceId, bytes32 policyVersion, uint256 ceiling
    );
    event SubjectMigrated(
        address indexed previousSubject, address indexed nextSubject, bytes32 indexed sourceId
    );

    event OracleRotated(address indexed previousOracle, address indexed newOracle);
    event AttestationSubmitted(
        address indexed subject, DataSourceType sourceType, Tier tier, uint64 expiresAt, bytes32 proofHash
    );
    event AttestationRevoked(address indexed subject);

    constructor(address rootController_, address initialOracle) {
        if (rootController_ == address(0)) revert ZeroAddress();
        rootController = rootController_;
        _rotateOracle(initialOracle);
    }

    modifier onlyRoot() {
        if (msg.sender != rootController) revert NotRoot();
        _;
    }

    modifier onlyOracle() {
        if (oracle == address(0) || msg.sender != oracle) revert NotOracle();
        _;
    }

    /// @dev Milestone 1 uses a manual writer. Milestone 3 can rotate to a CRE receiver adapter.
    function rotateOracle(address newOracle) external onlyRoot {
        _rotateOracle(newOracle);
    }

    function revokeOracle() external onlyRoot {
        _rotateOracle(address(0));
    }

    /// @notice One-way opt-in. Use a fresh deployment; legacy positions are not auto-enrolled.
    function enableEvidenceMode(address controller) external onlyRoot {
        if (evidenceMode || controller.code.length == 0) revert InvalidEvidence();
        evidenceMode = true;
        positionController = controller;
        emit EvidenceModeEnabled(controller);
    }

    function submitEligibility(EligibilityReport calldata r) external onlyOracle {
        if (!evidenceMode) revert EvidenceRequired();
        if (r.subject == address(0) || retiredWallet[r.subject]) revert InvalidEvidence();
        if (r.sourceId == bytes32(0) || r.sessionId == bytes32(0) || r.proofHash == bytes32(0)) {
            revert InvalidEvidence();
        }
        if (r.policyVersion != POLICY_VERSION || r.tier == Tier.NONE) revert InvalidEvidence();
        uint256 expectedCeiling = r.tier == Tier.TIER_1 ? 50e6 : r.tier == Tier.TIER_2 ? 80e6 : 120e6;
        if (r.ceiling != expectedCeiling) revert InvalidEvidence();
        if (
            r.observedAt > block.timestamp || block.timestamp - r.observedAt > 1 days
                || r.expiresAt <= block.timestamp || r.expiresAt > r.observedAt + 7 days
        ) revert InvalidExpiry();
        if (usedProofHashes[r.proofHash]) revert ProofAlreadyUsed();
        if (usedSessions[r.sessionId]) revert SessionAlreadyUsed();
        if (sourceOwner[r.sourceId] != address(0) && sourceOwner[r.sourceId] != r.subject) {
            revert SourceAlreadyBound();
        }
        if (sourceOf[r.subject] != bytes32(0) && sourceOf[r.subject] != r.sourceId) {
            revert SourceAlreadyBound();
        }
        if (r.observedAt <= latestObservation[r.sourceId]) revert InvalidEvidence();
        usedProofHashes[r.proofHash] = true;
        usedSessions[r.sessionId] = true;
        sourceOwner[r.sourceId] = r.subject;
        sourceOf[r.subject] = r.sourceId;
        latestObservation[r.sourceId] = r.observedAt;
        eligibility[r.subject] = r;
        attestations[r.subject] = Attestation(
            DataSourceType.PAYMENT_PROCESSOR_REVENUE,
            r.tier,
            uint64(block.timestamp),
            r.expiresAt,
            r.proofHash
        );
        emit AttestationSubmitted(
            r.subject, DataSourceType.PAYMENT_PROCESSOR_REVENUE, r.tier, r.expiresAt, r.proofHash
        );
        emit EligibilityAccepted(r.subject, r.sourceId, r.policyVersion, r.ceiling);
    }

    function eligibilityCeiling(address subject) external view returns (uint256) {
        return attestations[subject].expiresAt > block.timestamp ? eligibility[subject].ceiling : 0;
    }

    /// @dev Only the credit line may move identity, atomically with all collateral and debt.
    function migrateSubject(address previous, address next) external {
        if (!evidenceMode || msg.sender != positionController) revert InvalidMigration();
        bytes32 source = sourceOf[previous];
        if (
            source == bytes32(0) || retiredWallet[previous] || next == address(0)
                || sourceOf[next] != bytes32(0) || retiredWallet[next]
        ) revert InvalidMigration();
        sourceOf[next] = source;
        sourceOwner[source] = next;
        retiredWallet[previous] = true;
        eligibility[next] = eligibility[previous];
        eligibility[next].subject = next;
        attestations[next] = attestations[previous];
        delete eligibility[previous];
        delete attestations[previous];
        // Keep sourceOf[previous] as a tombstone; never free an old identity for reuse.
        emit SubjectMigrated(previous, next, source);
    }

    function submitAttestation(
        address subject,
        DataSourceType sourceType,
        Tier tier,
        uint64 expiresAt,
        bytes32 proofHash
    ) external onlyOracle {
        if (evidenceMode) revert EvidenceRequired();
        if (subject == address(0)) revert ZeroAddress();
        if (tier == Tier.NONE) revert InvalidTier();
        if (expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_VALIDITY) {
            revert InvalidExpiry();
        }
        if (proofHash == bytes32(0)) revert InvalidProofHash();
        if (usedProofHashes[proofHash]) revert ProofAlreadyUsed();

        // The writer must supply a canonical proof identifier and verify wallet/session binding.
        // Hashing an arbitrary JSON serialization is not sufficient replay protection.
        usedProofHashes[proofHash] = true;
        attestations[subject] = Attestation(sourceType, tier, uint64(block.timestamp), expiresAt, proofHash);
        emit AttestationSubmitted(subject, sourceType, tier, expiresAt, proofHash);
    }

    function revoke(address subject) external onlyOracle {
        if (subject == address(0)) revert ZeroAddress();
        delete attestations[subject];
        // Consumed proof hashes stay consumed after revocation.
        emit AttestationRevoked(subject);
    }

    function isValid(address subject, DataSourceType sourceType, Tier minTier) external view returns (bool) {
        Attestation memory a = attestations[subject];
        return minTier != Tier.NONE && a.tier != Tier.NONE && a.sourceType == sourceType && a.tier >= minTier
            && a.expiresAt > block.timestamp;
    }

    function _rotateOracle(address newOracle) private {
        emit OracleRotated(oracle, newOracle);
        oracle = newOracle;
    }
}
