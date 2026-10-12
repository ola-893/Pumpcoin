// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {VaultFixture} from "./VaultFixture.sol";
import {UnoraVault} from "../../src/vault/UnoraVault.sol";

contract AutonomousTradingTest is VaultFixture {
    function setUp() public override {
        super.setUp();
        vm.prank(alice); vault.deposit(1000e6, alice);
    }
    function grant(uint256 cap, uint64 expires) internal {
        bytes32 config = vault.currentConfigHash();
        vm.prank(admin); vault.grantTradingPermission(manager, config, expires, cap, 50);
    }
    function buy(uint256 n, uint256 minimum) internal returns (uint256) {
        vm.prank(manager);
        return vault.managerTrade(address(quote), address(asset), n, minimum, block.timestamp + 120, address(venue));
    }
    function sell(uint256 n) internal returns (uint256) {
        vm.prank(manager);
        return vault.managerTrade(address(asset), address(quote), n, n, block.timestamp + 120, address(venue));
    }
    function testOwnerGrantsOnceManagerTradesWithoutOwner() public {
        grant(100e6, uint64(block.timestamp + 1 days));
        buy(20e6, 19900000); sell(10e6);
        assertEq(vault.dailyQuoteTraded(block.timestamp / 1 days), 30e6);
        assertEq(asset.balanceOf(address(vault)), 10e6);
        assertEq(quote.allowance(address(vault), address(adapter)), 0);
        assertEq(asset.allowance(address(vault), address(adapter)), 0);
    }
    function testOnlyOwnerAndExactCurrentConfigurationCanGrant() public {
        bytes32 config = vault.currentConfigHash();
        vm.prank(attacker); vm.expectRevert(UnoraVault.NotAdmin.selector);
        vault.grantTradingPermission(manager, config, uint64(block.timestamp + 1 days), 100e6, 50);
        vm.prank(admin); vm.expectRevert(UnoraVault.TradingPermissionDenied.selector);
        vault.grantTradingPermission(attacker, config, uint64(block.timestamp + 1 days), 100e6, 50);
        vm.prank(admin); vm.expectRevert(UnoraVault.TradingPermissionDenied.selector);
        vault.grantTradingPermission(manager, keccak256("stale"), uint64(block.timestamp + 1 days), 100e6, 50);
        vm.prank(admin); vm.expectRevert(UnoraVault.TradingPermissionDenied.selector);
        vault.grantTradingPermission(manager, config, uint64(block.timestamp + 31 days), 100e6, 50);
    }
    function testDailyCapCountsBuySellAndCannotBeResetByRenewing() public {
        grant(30e6, uint64(block.timestamp + 2 days));
        buy(20e6, 20e6); sell(10e6);
        grant(30e6, uint64(block.timestamp + 2 days));
        vm.expectRevert(UnoraVault.DailyTradingLimit.selector); buy(1e6, 1e6);
        uint256 nextDay = block.timestamp / 1 days + 1;
        vm.warp(nextDay * 1 days); setPrice(1e18);
        buy(1e6, 1e6);
        assertEq(vault.dailyQuoteTraded(nextDay), 1e6);
    }
    function testSlippageIsEnforcedEvenWhenManagerChoosesWeakMinimum() public {
        grant(100e6, uint64(block.timestamp + 1 days));
        vm.expectRevert(UnoraVault.SlippageLimit.selector); buy(10e6, 1);
        vm.expectRevert(UnoraVault.SlippageLimit.selector); buy(10e6, 9949999);
        buy(10e6, 9950000);
        assertEq(vault.dailyQuoteTraded(block.timestamp / 1 days), 10e6);
    }
    function testExpiryAndLongTransactionDeadlineFailClosed() public {
        uint64 expiry = uint64(block.timestamp + 60);
        grant(100e6, expiry);
        vm.prank(manager); vm.expectRevert(UnoraVault.TradingPermissionDenied.selector);
        vault.managerTrade(address(quote), address(asset), 1e6, 1e6, block.timestamp + 301, address(venue));
        vm.warp(expiry);
        vm.expectRevert(UnoraVault.TradingPermissionDenied.selector); buy(1e6, 1e6);
    }
    function testRevocationCannotFallBackToUnrestrictedManagerTrading() public {
        grant(100e6, uint64(block.timestamp + 1 days)); buy(10e6, 10e6);
        vm.prank(admin); vault.revokeTradingPermission();
        assertTrue(vault.tradingPermissionRequired());
        vm.expectRevert(UnoraVault.TradingPermissionDenied.selector); buy(1e6, 1e6);
    }
    function testManagerRotationAndRoundTripRotationInvalidateOldGrant() public {
        grant(100e6, uint64(block.timestamp + 2 days));
        vm.startPrank(admin); vault.rotateManager(attacker, STRAT_V1, RISK_V1); vault.rotateManager(manager, STRAT_V1, RISK_V1); vm.stopPrank();
        vm.expectRevert(UnoraVault.TradingPermissionDenied.selector); buy(1e6, 1e6);
    }
    function testAdminTransferInvalidatesOldGrant() public {
        grant(100e6, uint64(block.timestamp + 2 days));
        vm.prank(admin); vault.setAdmin(attacker);
        vm.expectRevert(UnoraVault.TradingPermissionDenied.selector); buy(1e6, 1e6);
    }
    function testAppliedConfigurationInvalidatesOldGrant() public {
        grant(100e6, uint64(block.timestamp + 3 days));
        proposeSameConfig(); vm.warp(block.timestamp + 1 days + 1); setPrice(1e18);
        vm.prank(admin); vault.applyConfig();
        vm.expectRevert(UnoraVault.TradingPermissionDenied.selector); buy(1e6, 1e6);
    }
    function testVenueRevertDoesNotConsumeDailyBudget() public {
        grant(100e6, uint64(block.timestamp + 1 days));
        vm.expectRevert(); buy(10e6, 11e6);
        assertEq(vault.dailyQuoteTraded(block.timestamp / 1 days), 0);
    }
    function testCanRevokeWhenPausedAndPriceUnavailable() public {
        grant(100e6, uint64(block.timestamp + 1 days));
        vm.prank(admin); vault.pause(); vm.warp(block.timestamp + 2 hours);
        vm.prank(admin); vault.revokeTradingPermission();
        (uint64 expiry,,,,) = vault.tradingPermission(); assertEq(expiry, 0);
    }
    function testFuzzDailyBudgetNeverExceeded(uint96 n) public {
        uint256 amount = bound(n, 1, 100e6);
        grant(100e6, uint64(block.timestamp + 1 days));
        buy(amount, amount);
        assertLe(vault.dailyQuoteTraded(block.timestamp / 1 days), 100e6);
    }
}
