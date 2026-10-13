// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {EligibilityReceiver} from "../src/EligibilityReceiver.sol";
import {SimulationEligibilityReceiver} from "../src/mocks/SimulationEligibilityReceiver.sol";
import {DemoToken} from "shared/DemoToken.sol";
import {RepaymentVault} from "../src/RepaymentVault.sol";
import {AgentCreditMandate} from "../src/AgentCreditMandate.sol";

/// @dev Fresh test-only deployment. Never mutates the existing manual-demo addresses.
contract DeployEligibility is Script {
    function run() external {
        require(block.chainid == 31337 || block.chainid == 10143, "test chains only");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address forwarder = vm.envAddress("CRE_FORWARDER_ADDRESS");
        // Explicit opt-in, never silently fall back from authenticated delivery.
        bool simulation = vm.envOr("CRE_SIMULATION_RECEIVER", false);
        vm.startBroadcast(deployer);
        DemoToken collateral = new DemoToken("ProofLine Evidence Collateral", "pCOL");
        DemoToken loan = new DemoToken("ProofLine Evidence Dollar", "pUSD");
        AttestationRegistry registry = new AttestationRegistry(deployer, address(0));
        CreditLine line = new CreditLine(registry, collateral, loan);
        RepaymentVault vault = new RepaymentVault(loan, address(line));
        AgentCreditMandate mandate = new AgentCreditMandate(address(line), loan);
        line.pinAgentCreditMandate(address(mandate));
        address receiver;
        if (simulation) {
            receiver = address(new SimulationEligibilityReceiver(registry, forwarder, deployer));
        } else {
            receiver = address(
                new EligibilityReceiver(
                    registry, forwarder, vm.envBytes32("CRE_WORKFLOW_ID"), vm.envAddress("CRE_WORKFLOW_OWNER")
                )
            );
        }
        registry.enableEvidenceMode(address(line));
        registry.rotateOracle(address(receiver));
        vm.stopBroadcast();
        console2.log("ELIGIBILITY_REGISTRY", address(registry));
        console2.log("ELIGIBILITY_RECEIVER", address(receiver));
        console2.log("CREDIT_LINE_ADDRESS", address(line));
        console2.log("REPAYMENT_VAULT_ADDRESS", address(vault));
        console2.log("AGENT_CREDIT_MANDATE_ADDRESS", address(mandate));
        console2.log("COLLATERAL_TOKEN_ADDRESS", address(collateral));
        console2.log("LOAN_TOKEN_ADDRESS", address(loan));
    }
}
