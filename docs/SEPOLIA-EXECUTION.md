# RYO research with Ethereum Sepolia execution

Pump now defaults to Ethereum Sepolia (chain **11155111**). RYO supplies attributable market research; the registered local model interprets evidence; Pump applies signed policies. RYO's builder MCP account does not supply a wallet, inference server or swap execution. The execution path uses **WETH / Circle test-USDC on official Uniswap v4**, with independent Chainlink ETH/USD and USDC/USD reference feeds.

This migration preserves the existing registration, profile, evidence and investment flows. Historical Monad signatures, vaults and receipts retain their original chain. They are not relabeled, bridged or silently rebound. A real agent needs a new Sepolia declaration and controller authorization before using a new vault.

## Public execution proof · October 23, 2026

[Machine-readable receipt package](../deployments/ryo-sepolia-execution.json) includes the committed validation manifest, contract runtime hashes, all 21 transaction hashes, canonical block hashes, decoded trade/deposit/redemption events and actual gas paid.

This is **controller-driven infrastructure validation**, using a dedicated restricted execution signer. It is not a local-model enrollment, a RYO-directed decision, a strategy comparison or proof of profitability. The on-chain identity explicitly says infrastructure validation and commits the complete manifest by hash. It is deliberately absent from the AI agent directory.

| Operation | Confirmed result | Receipt |
| --- | --- | --- |
| Seed vault capital | 1 test-USDC → 1 Pump share (12 decimals) | [Deposit](https://sepolia.etherscan.io/tx/0x3e6d5b07b09619cf971cca6adaf8e60f745f01dc7bdb16314b51da058275f698) |
| Buy WETH | 0.01 test-USDC → 0.000004170400975279 WETH | [Buy](https://sepolia.etherscan.io/tx/0x24a04949d27d7893911d38750703f1afdd067c0a259e8705e1a9c3c1a435a453) |
| Sell acquired WETH | Acquired WETH → 0.00998 test-USDC | [Sell](https://sepolia.etherscan.io/tx/0x7a640b04f49b3ba62015246561217672edb3662dd32082ccdde64a88da333a9b) |
| Invest ETH | 0.000001 test ETH → 0.002392047840 Pump shares | [Investment](https://sepolia.etherscan.io/tx/0x8c38067f97a5b16cf0b33ea4ba22875c65c265928be736ff5b74109c41d35303) |
| Redeem ETH investment | Same shares burned → 0.000000996987276882 ETH, before wallet gas | [Redemption](https://sepolia.etherscan.io/tx/0x8eb4f4429bd321d60aa242df1aa2135d676e76c13edb4cf434f41902963a09b8) |
| Return seed capital | 1 Pump share burned → 0.999981 test-USDC | [Capital exit](https://sepolia.etherscan.io/tx/0x617bb114c4fc846f627d15dec9dfb4ec1ceffd3b341dd8a88d09c5255234106a) |
| Revoke manager | Test trading permission revoked | [Revocation](https://sepolia.etherscan.io/tx/0xb7c1da16faacc9926faea1b44b655f1b24ef3409140c1ac6e62eddae8883983f) |

End state: zero investor shares, zero WETH position and zero quote balance. Capital funding is accounted separately from swap results. The native round trip includes conversion fees/rounding; it is not a trading-return measurement. Actual transaction gas totaled **1,887,886,992 wei** (0.000000001887886992 ETH), separately from capital and liquidity funding.

| Deployment | Sepolia address |
| --- | --- |
| Validation vault | `0x54dbdFD1a91fa86048e9d9A96b309B4CFFEB5Ff5` |
| Trading bundle | `0x3fbACDf7a21c23EB6aa56E34cE8F5e8d0d1aa89e` |
| Valuation source | `0xd9Ef61D081250A64aC39707863Ffd385e85d9d7f` |
| Restricted adapter | `0x0d429Fd58Ffa02ff79f625BdC8D1B15F5A2B4C3d` |
| Swap venue | `0x2ae3895403299014b2DDb54A5EA0a2eb160ebece` |
| Quote gateway | `0x1E00E6371677E5078b7204C9B168c6892aCEfbd0` |
| ETH gateway | `0x03b54B7C55FdfD4956077381c6EF1A983AfcfCb5` |
| Controller pool funder | `0x184299685D95F31cCd4ADc0222367C4bd6Df0631` |

## Liquidity and oracle boundaries

A deployed DEX is not evidence of usable liquidity. Existing standard WETH/test-USDC pools failed the required capacity/price checks. The validation therefore funded a **hook-free project-owned demo pool**, fee 1000 (0.1%), tick spacing 10, with at most 0.2 test-USDC and 0.0001 test ETH. Unused funding returns to the controller. The position stays funded for future small demonstrations, but its narrow range can become unavailable as reference prices move. This is controlled testnet liquidity, not mainnet price discovery or an economically deep market.

The source pins both Chainlink proxies, their current aggregators and code hashes. It requires ETH observations within 7,200 seconds and USDC observations within 172,800 seconds, matching their different heartbeat schedules with tolerance. It also requires pool/oracle deviation ≤5% and virtual active quote liquidity ≥100 test-USDC. Virtual liquidity is a concentrated-liquidity screen; it is **not** 100 spendable USDC in the pool. Every actual swap is simulated and bounded separately. Test-USDC reference valuation does not promise redeemable USD value. Feed upgrades require reviewed replacement infrastructure. No oracle relay keeper or price setter is needed on this path.

## Safety requirement repair

Research policy v2 removes the impossible RYO boolean `safe` gate. Instead, the controller signs exact instrument IDs/symbols/networks, a minimum observed liquidity and maximum liquidity participation (≤1%). Risk coverage stays explicit: unavailable means unknown, and reported provider flags block new entries. An empty flag list is not a safety certificate. Price, liquidity, timestamp, source coverage and deterministic risk checks still apply at decision and fill time. Old policies cannot gain these permissions without a new signature. See [research policy and mapping](RYO-CHAN.md#response-mapping-format).

The signed **research** allowlist does not authorize arbitrary on-chain assets. The live vault/adapter/venue remain restricted to the declared WETH/test-USDC pair, configuration, permission expiry, turnover, exposure and slippage bounds.

## Reproduce

Read-only verification needs Node 22.13+, installed dependencies, built contract artifacts and public Sepolia RPC access. It does not load `.env`:

```sh
npm run build:contracts
npm run execution:verify-sepolia
```

The verifier retrieves canonical receipts, recomputes actual gas, decodes events independently, reconciles minted/burned shares, checks runtime hashes and checks final balances and revocation at the terminal receipt block. RPC responses remain a trust boundary; the explorer links provide another operator-visible reference.

```sh
# Controlled tests; these are not counted as live evidence.
npm test
npm run test:contracts
PUMPCOIN_SEPOLIA_FORK=true forge test --root contracts --match-contract SepoliaExecutionForkTest -vv
npm run typecheck
npm run build
npm run lint
```

For **new real agent** deployment, keep its registered local model running, prepare/sign its Sepolia declaration in `/register`, create and verify its vault, then provision infrastructure with `operator:deploy -- ... --chain 11155111`. That CLI defaults to a maximum 0.001 ETH gas cost per creation. The profile retains wallet review for configuration, permissions, investments and redemptions. Worker configurations must separately commit reviewed contract pins and ETH-denominated gas budgets; do not copy historical MON reserve settings.

The validation CLI is an operator-only recovery tool:

```sh
npm run execution:sepolia                 # preflight; no broadcast
npm run execution:sepolia -- --broadcast # explicit bounded testnet lifecycle
```

It reads the root controller key and encrypted execution signer locally. Maximum cumulative gas is 0.001 ETH; pool funding ≤0.0001 ETH/0.2 test-USDC, execution gas funding 0.00005 ETH, native investment 0.000001 ETH, and seed capital 1 test-USDC. Signed transactions are saved privately before broadcast. Restarts reconcile identical hashes; they never allocate replacement transactions after an ambiguous send. Do not delete journals or stale locks to force progress. Changing artifacts changes the manifest commitment, so reconcile an existing run before starting a new version. The proof's old `depositMON`, `redeemMON` and event field `mon` names are legacy ABI identifiers; on chain 11155111 they operate on ETH/WETH.

## Remaining acceptance checks

- Latest authentic RYO probes had unavailable priced data. A successful reviewed mapping for identity, price, liquidity and timestamps is still required for RYO-driven practice entries. The safety repair does not fill those missing fields.
- Authorized selected-KOL X data and a running registered local model are still required before claiming complete live Multi-KOL behavior. No unsupported winner is declared.
- External Chrome visibly matched the helper's Sepolia configuration and loaded all five existing agents; the infrastructure validation identity was not added as an AI agent. The clean-window registration screen worked; the normal profile produced unrelated Talisman onboarding errors. No extension settings were changed. A connected-wallet Sepolia walkthrough and a real agent's new enrollment remain unverified.
- The public validation proves execution plumbing only. Its fixed test orders are not reported as AI decisions or agent trust history.

## Verification results

- 185 TypeScript tests passed, including cross-chain directory checks, exact wallet authorizations, replay, policy v2 and ambiguous-send recovery.
- 108 contract tests passed; the opt-in fork test was skipped in that offline suite and passed separately against Sepolia, including ETH entry/exit.
- Root type checking and production build passed. Lint exited successfully with existing React hook/purity warnings; the build retains a bundle-size warning.
- The read-only public verifier passed all 21 receipts through block 11976347, share-event reconciliation, runtime hashes, zero final balances and revoked permission.
- No configured controller/provider credentials were found in the changed or new non-ignored files.
