// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DemoToken} from "../../src/mocks/DemoToken.sol";
import {VaultValuationSource} from "../../src/vault/VaultValuationSource.sol";
import {MockSpotVenue} from "../../src/vault/MockSpotVenue.sol";
import {RestrictedSpotAdapter} from "../../src/vault/RestrictedSpotAdapter.sol";
import {ServiceExpenseStream} from "../../src/vault/ServiceExpenseStream.sol";
import {UnoraVault} from "../../src/vault/UnoraVault.sol";
import {MockERC8004Registry} from "../../src/vault/MockERC8004Registry.sol";

/// @notice Shared fixture for vault acceptance tests (simulation evidence, Anvil only).
contract VaultFixture is Test {
    DemoToken quote;
    DemoToken asset;
    VaultValuationSource source;
    UnoraVault vault;
    RestrictedSpotAdapter adapter;
    MockSpotVenue venue;
    ServiceExpenseStream stream;
    MockERC8004Registry registry;

    address admin = makeAddr("admin");
    address manager = makeAddr("manager");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address attacker = makeAddr("attacker");
    address service = makeAddr("service");

    uint256 agentId;
    bytes32 constant STRAT_V1 = keccak256("strategy-v1");
    bytes32 constant RISK_V1 = keccak256("risk-v1");
    bytes32 constant POLICY_HASH = keccak256("UNORA-VAULT-NAV-v1.0.0");

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        quote = new DemoToken("Demo USD", "pUSD");
        asset = new DemoToken("Demo Asset", "pAST");
        source = new VaultValuationSource(address(this), 1e18, 1 hours);
        source.setAdmin(admin);
        registry = new MockERC8004Registry();
        vm.prank(manager);
        agentId = registry.register(manager);
        vm.startPrank(admin);
        vault = new UnoraVault(
            IERC20(address(quote)),
            IERC20(address(asset)),
            source,
            admin,
            manager,
            STRAT_V1,
            RISK_V1,
            500e6,
            800e6,
            100e6,
            1e6,
            POLICY_HASH
        );
        adapter = new RestrictedSpotAdapter(address(vault), address(0), address(quote), address(asset));
        venue = new MockSpotVenue(IERC20(address(quote)), IERC20(address(asset)), address(adapter));
        stream = new ServiceExpenseStream(IERC20(address(quote)), address(vault), admin);
        stream.setRecipient(service, true);
        // Full effective configuration (venue, stream, identity) rides the timelock.
        vault.proposeConfig(
            UnoraVault.ConfigArgs({
                adapter: address(adapter),
                venue: address(venue),
                stream: address(stream),
                valuationSource: address(source),
                perTradeCap: 500e6,
                maxPositionValue: 800e6,
                expenseBudget: 100e6,
                strategyHash: STRAT_V1,
                riskHash: RISK_V1,
                identityRegistry: address(registry),
                agentId: agentId
            })
        );
        vm.warp(block.timestamp + 1 days + 1);
        source.updatePrice(1e18);
        vault.applyConfig();
        vm.stopPrank();

        // Fund venue liquidity.
        quote.mint(address(venue), 10_000e6);
        asset.mint(address(venue), 10_000e6);
        // Fund investors.
        quote.mint(alice, 10_000e6);
        quote.mint(bob, 10_000e6);
        quote.mint(attacker, 10_000e6);
        vm.startPrank(alice);
        quote.approve(address(vault), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(bob);
        quote.approve(address(vault), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(attacker);
        quote.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    function managerBuy(uint256 amountIn, uint256 minOut) internal returns (uint256) {
        vm.prank(manager);
        return
            vault.managerTrade(
                address(quote), address(asset), amountIn, minOut, block.timestamp + 1 hours, address(venue)
            );
    }

    function managerSell(uint256 amountIn, uint256 minOut) internal returns (uint256) {
        vm.prank(manager);
        return
            vault.managerTrade(
                address(asset), address(quote), amountIn, minOut, block.timestamp + 1 hours, address(venue)
            );
    }

    function setPrice(uint256 p) internal {
        vm.prank(admin);
        source.updatePrice(p);
    }

    function proposeSameConfig() internal {
        vm.startPrank(admin);
        vault.proposeConfig(
            UnoraVault.ConfigArgs({
                adapter: address(adapter),
                venue: address(venue),
                stream: address(stream),
                valuationSource: address(source),
                perTradeCap: vault.perTradeCap(),
                maxPositionValue: vault.maxPositionValue(),
                expenseBudget: vault.expenseBudget(),
                strategyHash: vault.strategyHash(),
                riskHash: vault.riskHash(),
                identityRegistry: vault.identityRegistry(),
                agentId: vault.agentId()
            })
        );
        vm.stopPrank();
    }
}
