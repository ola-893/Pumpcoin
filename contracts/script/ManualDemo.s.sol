// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AttestationRegistry, DataSourceType, Tier} from "../src/AttestationRegistry.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {DemoToken} from "../src/mocks/DemoToken.sol";

/// @notice Explicitly synthetic milestone-1 attestation. Does not generate or verify income proofs.
contract ManualDemo is Script {
    // Keep script state in memory to avoid Solc 0.8.24 via-IR stack pressure.
    struct Demo {
        address borrower;
        AttestationRegistry registry;
        CreditLine line;
        DemoToken collateral;
        DemoToken loan;
    }
    function run() external {
        require(block.chainid == 31337 || block.chainid == 10143, "local or Monad testnet only");
        Demo memory d;
        d.borrower = vm.envAddress("DEPLOYER_ADDRESS");
        d.registry = AttestationRegistry(vm.envAddress("ATTESTATION_REGISTRY_ADDRESS"));
        d.line = CreditLine(vm.envAddress("CREDIT_LINE_ADDRESS"));
        require(d.registry.oracle() == d.borrower, "manual demo requires borrower to be temporary writer");
        require(address(d.line.registry()) == address(d.registry), "registry mismatch");
        require(
            d.line.collateralOf(d.borrower) == 0 && d.line.borrowedOf(d.borrower) == 0, "use a fresh demo position"
        );
        require(
            !d.registry.isValid(d.borrower, DataSourceType.PAYMENT_PROCESSOR_REVENUE, Tier.TIER_2),
            "already boosted"
        );
        d.collateral = DemoToken(address(d.line.collateralToken()));
        d.loan = DemoToken(address(d.line.loanToken()));

        vm.startBroadcast(d.borrower);
        d.collateral.mint(d.borrower, 100e6);
        d.loan.mint(d.borrower, 1000e6);
        d.loan.approve(address(d.line), 1000e6);
        d.line.fundLiquidity(1000e6);
        d.collateral.approve(address(d.line), 100e6);
        d.line.deposit(100e6);
        require(d.line.maxBorrow(d.borrower) == 50e6, "base limit must be 50");
        d.line.borrow(50e6);

        bytes32 syntheticHash = keccak256(
            abi.encode(
                "PROOFLINE_MANUAL_DEMO_NOT_A_PROOF", block.chainid, address(d.registry), d.borrower, block.number
            )
        );
        d.registry.submitAttestation(
            d.borrower,
            DataSourceType.PAYMENT_PROCESSOR_REVENUE,
            Tier.TIER_2,
            uint64(block.timestamp + 7 days),
            syntheticHash
        );
        require(d.line.maxBorrow(d.borrower) == 80e6, "boosted limit must be 80");
        d.line.borrow(30e6);
        require(d.line.borrowedOf(d.borrower) == 80e6, "total debt must be 80");
        vm.stopBroadcast();
        console2.log("Deposited pCOL", uint256(100));
        console2.log("Base pUSD limit", uint256(50));
        console2.log("Attested pUSD limit", uint256(80));
        console2.log("Borrowed pUSD", uint256(80));
        console2.log("Manual attestation only; no verified income yet.");
    }
}
