// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {DemoToken} from "shared/DemoToken.sol";
import {RepaymentVault} from "../src/RepaymentVault.sol";

contract Deploy is Script {
    function run() external {
        require(block.chainid == 31337 || block.chainid == 10143, "local or Monad testnet only");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address root = vm.envOr("ROOT_CONTROLLER_ADDRESS", deployer);
        address writer = vm.envOr("ORACLE_WRITER_ADDRESS", deployer);
        require(deployer != address(0), "missing deployer");
        vm.startBroadcast(deployer);
        DemoToken collateral = new DemoToken("ProofLine Demo Collateral", "pCOL");
        DemoToken loan = new DemoToken("ProofLine Demo Dollar", "pUSD");
        AttestationRegistry registry = new AttestationRegistry(root, writer);
        CreditLine line = new CreditLine(registry, collateral, loan);
        RepaymentVault vault = new RepaymentVault(loan, address(line));
        vm.stopBroadcast();
        console2.log("COLLATERAL_TOKEN_ADDRESS", address(collateral));
        console2.log("LOAN_TOKEN_ADDRESS", address(loan));
        console2.log("ATTESTATION_REGISTRY_ADDRESS", address(registry));
        console2.log("CREDIT_LINE_ADDRESS", address(line));
        console2.log("REPAYMENT_VAULT_ADDRESS", address(vault));
    }
}
