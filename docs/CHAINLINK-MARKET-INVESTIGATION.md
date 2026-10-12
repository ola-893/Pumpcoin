# Chainlink replacement-market investigation · 12 October 2026

No compliant replacement market was selected or deployed. The executable quote preview is implemented, but this investigation did not establish a live tradable replacement vault.

## Read-only observation

At Monad testnet block **70421272**, the five feeds in Chainlink's current Monad testnet directory were inspected through `AggregatorV3Interface`, including their proxy/aggregator runtime hashes, descriptions, decimals, round IDs, positive answers and update times. All failed the current 300-second policy at that block:

| Feed | Age (seconds) | Directory heartbeat (seconds) |
| --- | ---: | ---: |
| USDC / USD | 82,088 | 86,400 |
| USDT / USD | 82,255 | 86,400 |
| ETH / USD | 547 | 86,400 |
| LINK / USD | 503 | 86,400 |
| BTC / USD | 6,425 | 86,400 |

The directory contains no MON/USD feed. This is a point-in-time observation, not a claim that ETH/LINK never update within five minutes. A published feed and a free onchain interface do not guarantee the update frequency required by our signed strategy and vault policy. Changing only the position token does not resolve the stale USDC reference used for an independent quote-relative valuation.

## WETH / test-USDC candidate

The current official Monad token list identifies:

- USDC `0x534b2f3A21130d7a60830c2Df862319e593943A3`; onchain decimals verified as 6.
- WETH `0x45477f4709771331db81944A5E20eF95Bc7BA2D7`; onchain decimals verified as 18.

Both have deployed code. The current registry-listed v4 PoolManager and StateView code hashes match the reviewed network pins. Four standard zero-hook fee/tick pairs (100/1, 500/10, 3000/60 and 10000/200) all had zero active liquidity for these two tokens. No executable buy/sell quote was reported for those empty pools. This scan is bounded: it does not enumerate other deployments, tokens, hooks, fee tiers or historical pools.

Monad's protocol registry explicitly describes this v4 deployment as test infrastructure, **not an official Uniswap deployment**. Its listed quoter code was observed, but no independent source-bytecode verification or liquidity-backed quote established it as an approved replacement route.

WETH sorts before USDC. The current restricted venue only supports quote-token-first ordering and the current oracle source checks the exact description `MON / USD`. An eventual WETH replacement would therefore need a reviewed currency-order change and an ETH/USD-specific valuation source, plus a fresh declaration/commitment, identity and vault. The existing WMON manifest, risk caps and oracle pins have not been silently repurposed.

## Remaining requirements

A replacement must have a verified independent valuation with an explicit freshness policy compatible with the actual feeds, an initialized approved DEX pool with adequate liquidity and successful exact-route simulations, and a newly signed manifest and verified vault/infrastructure deployment followed by configuration notice and trading permission. None of those gates are waived by the quote preview.

The current stablecoin heartbeat and 300-second rule are incompatible with continuous availability: a feed can be operating within its published heartbeat while our vault appropriately blocks. Changing that risk policy would require a new reviewed declaration and contract configuration; this investigation does not relax it. Seeded test liquidity or another venue would still need verification before activation. No public-chain transaction was submitted.

## Sources and reproducible observations

- [Chainlink Monad testnet directory](https://reference-data-directory.vercel.app/feeds-monad-testnet.json)
- [Monad testnet token list](https://github.com/monad-crypto/token-list/blob/main/tokenlist-testnet.json)
- [Monad v4 protocol registry](https://github.com/monad-crypto/protocols/blob/main/testnet/uniswap_v4.jsonc)
- [Uniswap v4 quoter interface](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IV4Quoter.sol)
- `deployments/pumpcoin-chainlink-market-scan.json`: anchored read-only feed, token and pool observations.
- `docs/testing/executable-quotes-20261012/`: local Anvil quote, screenshot and validation evidence. These are simulations, not live Monad trading performance.
