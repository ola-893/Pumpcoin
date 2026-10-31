// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {PumpCoinRegisteredVault} from "./PumpCoinRegisteredVault.sol";

/// @notice Explicit instant-configuration DEMO vault, deployable only on Ethereum Sepolia testnet.
/// @dev Inherits all valuation, share accounting, spending, identity and permission
/// checks. The separate demo proposal removes ONLY the configuration notice.
/// The standard registration contract and already deployed vaults are unchanged.
contract PumpCoinSepoliaDemoRegisteredVault is PumpCoinRegisteredVault {
    bool public constant instantTestnetDemo = true;
    uint256 public constant DEMO_CONFIG_DELAY = 0;
    constructor(Registration memory r) PumpCoinRegisteredVault(_testnetRegistration(r)) {}
    function _testnetRegistration(Registration memory r) private view returns (Registration memory) {
        require(block.chainid == 11155111, "Ethereum Sepolia testnet demo only");
        return r;
    }
    function proposeDemoConfig(ConfigArgs calldata c) external onlyAdmin {
        require(block.chainid == 11155111, "Ethereum Sepolia testnet demo only");
        _checkConfig(c);
        pending.args = c;
        pending.effectiveAt = uint64(block.timestamp);
        pending.exists = true;
        emit ConfigProposed(_configHash(c), uint64(block.timestamp));
    }
}
