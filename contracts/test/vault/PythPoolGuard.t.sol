// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TradingPythFixture} from "./VaultTradingIntegration.t.sol";
import {DexCheckedPythVaultValuationSource} from "../../src/vault/PythVaultValuationSource.sol";

contract PoolStateFixture {
    uint160 public sqrtPrice;
    uint128 public liquidity;

    function set(uint160 sqrt_, uint128 liq) external {
        sqrtPrice = sqrt_;
        liquidity = liq;
    }

    function getSlot0(bytes32) external view returns (uint160, int24, uint24, uint24) {
        return (sqrtPrice, 0, 0, 3000);
    }

    function getLiquidity(bytes32) external view returns (uint128) {
        return liquidity;
    }
}

contract PythPoolGuardTest is Test {
    function testPoolDisagreementAndShallowLiquidityBlockValuation() public {
        vm.warp(1800000000);
        TradingPythFixture pyth = new TradingPythFixture();
        bytes32 mon = keccak256("mon");
        bytes32 usd = keccak256("usd");
        pyth.set(mon, 200000000, 1000, -8, block.timestamp);
        pyth.set(usd, 100000000, 1000, -8, block.timestamp);
        PoolStateFixture pool = new PoolStateFixture();
        uint160 sqrt = uint160(Math.sqrt(uint256(5e11) * (1 << 192)));
        pool.set(sqrt, 1e15);
        DexCheckedPythVaultValuationSource source = new DexCheckedPythVaultValuationSource(
            address(pyth), mon, usd, 300, 100, address(pool), keccak256("pool"), 500, 100e6
        );
        assertEq(source.price(), 2e6);
        (bool ok,) = source.status();
        assertTrue(ok);
        pool.set(sqrt, 1);
        (ok,) = source.status();
        assertFalse(ok);
        vm.expectRevert();
        source.markedValue(1e18);
        pool.set(sqrt * 2, 1e15);
        (ok,) = source.status();
        assertFalse(ok);
        pool.set(sqrt, 1e15);
        vm.warp(block.timestamp + 301);
        (ok,) = source.status();
        assertFalse(ok);
    }
}
