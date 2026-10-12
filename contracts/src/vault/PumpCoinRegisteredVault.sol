// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {VaultValuationSource} from "./VaultValuationSource.sol";
import {UnoraVault} from "./UnoraVault.sol";
import {UnconfiguredValuationSource} from "./UnconfiguredValuationSource.sol";

interface IPumpCoinIdentityRegistry {
    struct MetadataEntry { string metadataKey; bytes metadataValue; }
    function register(string calldata uri, MetadataEntry[] calldata metadata) external returns (uint256);
    function ownerOf(uint256 id) external view returns (address);
    function transferFrom(address from, address to, uint256 id) external;
}

/// @notice One controller-approved deployment creates a dedicated vault and
/// registers/binds its ERC-8004 identity atomically. No administrator middleman.
/// @dev Starts PAUSED with an unavailable valuation source and no adapter.
/// Registration does not assert trading readiness. Later activation retains the
/// existing one-day full-configuration notice; no bootstrap bypass is added.
contract PumpCoinRegisteredVault is UnoraVault {
    bytes32 public immutable registrationCommitment;
    address public immutable bootstrapSource;
    event AgentVaultRegistered(address indexed controller, address indexed manager,
        address indexed registry, uint256 identityId, bytes32 manifestCommitment);

    struct Registration {
        IERC20 quote; IERC20 position; address controller; address manager;
        bytes32 strategy; bytes32 risk; uint256 tradeCap; uint256 positionCap;
        address registry; string uri; bytes32 commitment;
    }
    constructor(Registration memory r)
        UnoraVault(r.quote, r.position,
            VaultValuationSource(address(new UnconfiguredValuationSource(IERC20Metadata(address(r.position)).decimals()))),
            r.controller, r.manager, r.strategy, r.risk, r.tradeCap, r.positionCap, 0, 1e6,
            keccak256(bytes("UNORA-VAULT-NAV-v1.0.0")))
    {
        require(msg.sender == r.controller && r.controller != r.manager, "controller");
        require(r.registry.code.length > 0 && r.commitment != bytes32(0), "registration");
        require(r.tradeCap > 0 && r.positionCap >= r.tradeCap, "limits");
        registrationCommitment = r.commitment;
        bootstrapSource = address(valuationSource);
        paused = true;
        tradingPermissionRequired = true;
        IPumpCoinIdentityRegistry registry = IPumpCoinIdentityRegistry(r.registry);
        IPumpCoinIdentityRegistry.MetadataEntry[] memory entries = new IPumpCoinIdentityRegistry.MetadataEntry[](1);
        entries[0] = IPumpCoinIdentityRegistry.MetadataEntry("pumpcoinManifestCommitment", abi.encodePacked(r.commitment));
        uint256 id = registry.register(r.uri, entries);
        require(registry.ownerOf(id) == address(this), "identity mint");
        registry.transferFrom(address(this), r.controller, id);
        require(registry.ownerOf(id) == r.controller, "identity owner");
        _closePeriod();
        identityRegistry = r.registry;
        agentId = id;
        _openPeriod();
        emit AgentVaultRegistered(r.controller, r.manager, r.registry, id, r.commitment);
    }
    /// The initial period has no investor shares or liabilities. Donated tokens
    /// cannot freeze activation; that unvalued period remains in the history.
    /// Notice and a healthy, correctly scaled next source are still required.
    function _allowUnvaluedInitialConfig() internal view override returns (bool) {
        return paused && address(valuationSource) == bootstrapSource && address(adapter) == address(0)
            && totalSupply() == 0 && accruedExpenses == 0 && _managedEscrow() == 0;
    }
}
