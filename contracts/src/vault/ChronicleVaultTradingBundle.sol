// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {UnoraVault} from "./UnoraVault.sol";
import {RestrictedSpotAdapter} from "./RestrictedSpotAdapter.sol";
import {ChronicleVaultValuationSource} from "./ChronicleVaultValuationSource.sol";
import {UniswapV4VaultVenue} from "./UniswapV4VaultVenue.sol";
import {VaultInvestorGateway} from "./VaultInvestorGateway.sol";

contract ChronicleVaultTradingBundle {
    address public immutable vault;
    ChronicleVaultValuationSource public immutable source;
    RestrictedSpotAdapter public immutable adapter;
    UniswapV4VaultVenue public immutable venue;
    VaultInvestorGateway public immutable gateway;
    struct Network { address monOracle; address usdOracle; address selfKisser; address poolManager; address stateView; uint24 fee; int24 tickSpacing; }
    constructor(address vault_, Network memory n, uint16 slippage) {
        UnoraVault v=UnoraVault(vault_);
        require(msg.sender==v.admin(), "controller");
        vault=vault_;
        require(v.asset()<address(v.positionAsset()), "order");
        bytes32 pool=keccak256(abi.encode(v.asset(),address(v.positionAsset()),n.fee,n.tickSpacing,address(0)));
        source=new ChronicleVaultValuationSource(n.monOracle,n.usdOracle,n.selfKisser,n.stateView,pool);
        adapter=new RestrictedSpotAdapter(vault_,address(0),v.asset(),address(v.positionAsset()));
        venue=new UniswapV4VaultVenue(address(adapter),n.poolManager,address(source),n.fee,n.tickSpacing,slippage);
        gateway=new VaultInvestorGateway(vault_);
    }
}
