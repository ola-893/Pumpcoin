// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry, DataSourceType, Tier} from "../src/AttestationRegistry.sol";

contract AttestationRegistryTest is Test {
    AttestationRegistry registry;
    address root = makeAddr("root");
    address writer = makeAddr("writer");
    address alice = makeAddr("alice");
    DataSourceType constant SOURCE = DataSourceType.PAYMENT_PROCESSOR_REVENUE;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new AttestationRegistry(root, writer);
    }

    function submit(address subject, Tier tier, uint64 expiry, bytes32 hash) internal {
        vm.prank(writer);
        registry.submitAttestation(subject, SOURCE, tier, expiry, hash);
    }

    function testSubmitAndQuery() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        vm.expectEmit(true, false, false, true, address(registry));
        emit AttestationRegistry.AttestationSubmitted(alice, SOURCE, Tier.TIER_2, expiry, bytes32(uint256(1)));
        submit(alice, Tier.TIER_2, expiry, bytes32(uint256(1)));
        (DataSourceType source, Tier tier, uint64 issuedAt, uint64 expiresAt, bytes32 hash) =
            registry.attestations(alice);
        assertEq(uint256(source), uint256(SOURCE));
        assertEq(uint256(tier), uint256(Tier.TIER_2));
        assertEq(issuedAt, block.timestamp);
        assertEq(expiresAt, expiry);
        assertEq(hash, bytes32(uint256(1)));
        assertTrue(registry.isValid(alice, SOURCE, Tier.TIER_1));
        assertTrue(registry.isValid(alice, SOURCE, Tier.TIER_2));
        assertFalse(registry.isValid(alice, SOURCE, Tier.TIER_3));
        assertFalse(registry.isValid(alice, DataSourceType.GIG_PLATFORM_EARNINGS, Tier.TIER_1));
        assertFalse(registry.isValid(alice, SOURCE, Tier.NONE));
    }

    function testDefaultAndExpiryBoundary() public {
        assertFalse(registry.isValid(alice, SOURCE, Tier.TIER_1));
        uint64 expiry = uint64(block.timestamp + 1 days);
        submit(alice, Tier.TIER_2, expiry, bytes32(uint256(1)));
        vm.warp(expiry - 1);
        assertTrue(registry.isValid(alice, SOURCE, Tier.TIER_2));
        vm.warp(expiry);
        assertFalse(registry.isValid(alice, SOURCE, Tier.TIER_2));
    }

    function testOnlyOracleCanWriteOrRevoke() public {
        vm.expectRevert(AttestationRegistry.NotOracle.selector);
        vm.prank(alice);
        registry.submitAttestation(
            alice, SOURCE, Tier.TIER_3, uint64(block.timestamp + 1 days), bytes32(uint256(1))
        );
        vm.expectRevert(AttestationRegistry.NotOracle.selector);
        vm.prank(root);
        registry.revoke(alice);
    }

    function testValidation() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        vm.expectRevert(AttestationRegistry.ZeroAddress.selector);
        submit(address(0), Tier.TIER_2, expiry, bytes32(uint256(1)));
        vm.expectRevert(AttestationRegistry.InvalidTier.selector);
        submit(alice, Tier.NONE, expiry, bytes32(uint256(1)));
        vm.expectRevert(AttestationRegistry.InvalidProofHash.selector);
        submit(alice, Tier.TIER_2, expiry, bytes32(0));
        vm.expectRevert(AttestationRegistry.InvalidExpiry.selector);
        submit(alice, Tier.TIER_2, uint64(block.timestamp), bytes32(uint256(1)));
        vm.expectRevert(AttestationRegistry.InvalidExpiry.selector);
        submit(alice, Tier.TIER_2, uint64(block.timestamp + 30 days + 1), bytes32(uint256(1)));
        submit(alice, Tier.TIER_2, uint64(block.timestamp + 30 days), bytes32(uint256(1)));
    }

    function testRevokeDoesNotResetReplayProtection() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        submit(alice, Tier.TIER_2, expiry, bytes32(uint256(1)));
        vm.prank(writer);
        registry.revoke(alice);
        assertFalse(registry.isValid(alice, SOURCE, Tier.TIER_1));
        vm.expectRevert(AttestationRegistry.ProofAlreadyUsed.selector);
        submit(alice, Tier.TIER_2, expiry, bytes32(uint256(1)));
        vm.expectRevert(AttestationRegistry.ProofAlreadyUsed.selector);
        submit(makeAddr("bob"), Tier.TIER_2, expiry, bytes32(uint256(1)));
    }

    function testFreshProofCanDowngradeOrRenew() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        submit(alice, Tier.TIER_3, expiry, bytes32(uint256(1)));
        submit(alice, Tier.TIER_1, expiry, bytes32(uint256(2)));
        assertFalse(registry.isValid(alice, SOURCE, Tier.TIER_2));
        assertTrue(registry.isValid(alice, SOURCE, Tier.TIER_1));
    }

    function testRootRotatesWriterAndOldWriterLosesAccess() public {
        address next = makeAddr("next");
        assertEq(registry.rootController(), root);
        vm.prank(alice);
        vm.expectRevert(AttestationRegistry.NotRoot.selector);
        registry.rotateOracle(next);
        vm.prank(writer);
        vm.expectRevert(AttestationRegistry.NotRoot.selector);
        registry.revokeOracle();
        vm.expectEmit(true, true, false, true, address(registry));
        emit AttestationRegistry.OracleRotated(writer, next);
        vm.prank(root);
        registry.rotateOracle(next);
        vm.expectRevert(AttestationRegistry.NotOracle.selector);
        submit(alice, Tier.TIER_2, uint64(block.timestamp + 1 days), bytes32(uint256(1)));
        vm.prank(writer);
        vm.expectRevert(AttestationRegistry.NotOracle.selector);
        registry.revoke(alice);
        vm.prank(next);
        registry.submitAttestation(
            alice, SOURCE, Tier.TIER_2, uint64(block.timestamp + 1 days), bytes32(uint256(1))
        );
    }

    function testRevocationPausesAllWritesAndRootCanRecover() public {
        submit(alice, Tier.TIER_2, uint64(block.timestamp + 1 days), bytes32(uint256(1)));
        vm.expectEmit(true, true, false, true, address(registry));
        emit AttestationRegistry.OracleRotated(writer, address(0));
        vm.prank(root);
        registry.revokeOracle();
        assertEq(registry.oracle(), address(0));
        assertTrue(registry.isValid(alice, SOURCE, Tier.TIER_2));
        vm.expectRevert(AttestationRegistry.NotOracle.selector);
        submit(alice, Tier.TIER_3, uint64(block.timestamp + 1 days), bytes32(uint256(2)));
        vm.prank(address(0));
        vm.expectRevert(AttestationRegistry.NotOracle.selector);
        registry.revoke(alice);
        vm.prank(root);
        registry.rotateOracle(writer);
        submit(alice, Tier.TIER_3, uint64(block.timestamp + 1 days), bytes32(uint256(2)));
        assertTrue(registry.isValid(alice, SOURCE, Tier.TIER_3));
    }

    function testZeroRootRejectedAndInitialOracleMayBePaused() public {
        vm.expectRevert(AttestationRegistry.ZeroAddress.selector);
        new AttestationRegistry(address(0), writer);
        AttestationRegistry paused = new AttestationRegistry(root, address(0));
        assertEq(paused.oracle(), address(0));
        vm.prank(root);
        paused.rotateOracle(writer);
        assertEq(paused.oracle(), writer);
        vm.prank(root);
        paused.rotateOracle(address(0));
        assertEq(paused.oracle(), address(0));
    }

    function testFuzzExpiry(uint32 ttl) public {
        ttl = uint32(bound(ttl, 1, 30 days));
        submit(alice, Tier.TIER_2, uint64(block.timestamp + ttl), bytes32(uint256(1)));
        assertTrue(registry.isValid(alice, SOURCE, Tier.TIER_2));
        vm.warp(block.timestamp + ttl);
        assertFalse(registry.isValid(alice, SOURCE, Tier.TIER_2));
    }
}
