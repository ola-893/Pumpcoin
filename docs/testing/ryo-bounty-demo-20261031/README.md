# RYO-CHAN bounty demo evidence · October 31

This cut is about **market evidence → local-model judgment → signed practice policy → decision/portfolio → replay**, following the [Autonomous Agents brief](https://dorahacks.io/hackathon/bounty/1380) viewed in external Chrome. It replaces the financial-lifecycle narrative for this bounty. Registration may supply brief identity context; investor transactions are outside this cut.

A fresh bounded observation completed at **16:57:06 Lagos**. Muse proposed HOLD, not a BUY. Eight signed observations now contain six errors and two genuine HOLDs. No orders, fills or positions exist. Virtual cash/equity remain $10,000; fees and realized P&L remain zero. Eight valuation marks are accounting observations, not trades.

## What RYO supplied

- `analyze_token` for ETH returned partial research at 16:55:15 Lagos. Decimal text, null technical indicators, coverage/warnings, provider verdict and underlying raw MCP exchange are retained.
- `monitor_market_sentiment_shift` did not yield a usable normalized observation in this capture. Its raw capture remains in the checkpoint. Both tools had usable observations in the previous seventh capture; do not splice that earlier sentiment into this decision.
- Coinbase ETH/USD spot book supplies separate practice quotes/depth. RYO research is not executable DEX liquidity. The signed policy explicitly authorizes the separate quote source.
- Decrypt RSS supplied 39 stored publications; freshness selection passed one publication to Muse, with a bounded text preview. Observing the feed does not verify its underlying story. The linked article could not be retrieved independently with the available web tool. Do not present the story as verified truth or label this a completed News Checker verification.

## Cause and effect, with limits

The exact Muse request and unedited JSON response are in the eighth receipt. It cites the market observation, RYO research and selected publication, assigns bearish/low-conviction/low-urgency interpretation and proposes HOLD. Citations and schema validation establish references to supplied evidence, not semantic truth.

The actual receipt records HOLD and no order. A separate read-only entry diagnostic using the same evidence/factors fails because required RYO sentiment/coverage and a cited fresh supporting catalyst are missing, with conflicting news interpretation. This diagnostic is explicitly hypothetical, not an actual rejected BUY or a changed historical decision.

The first model factor implies unavailable risk prevents confirmation. The signed rule records unavailable risk rather than automatically rejecting it; the market-only deterministic check passed. We preserve and explain that model/policy discrepancy. Do not describe the model’s wording as an enforced safety requirement.

## Evidence and verification

- `checkpoint-eight-observations.json`: raw providers, original publications, selected exact model exchange, signed policy, chained receipts, portfolio and valuation events.
- `verification.json`: verified history prefix, normalization, timing, request/response consistency, exact model judgment, hypothetical entry checks and independent zero-trade accounting.
- `verify.ts`: reproducible verifier. Uses the unchanged engine and original registration from the earlier evidence package; loads no credentials or private key.
- `external-chrome.json`: observed UI values and browser replay outcome, compared with saved state; no video-file or cryptographic screen attestation.
- `VOICEOVER.md`: bounty-focused narration. [Three-minute recording checklist](../../RYO-DEMO-CHECKLIST.md).
- Existing research policy/model inventory and template configuration are retained in [the earlier source package](../demo-resume-20261031/README.md). The original signatures do not bind the later runtime template configuration; it is separately recorded host evidence. Do not claim hardware attestation.

Run from the repository root:

```sh
node --import tsx docs/testing/ryo-bounty-demo-20261031/verify.ts
node --import tsx --test tests/practice-ledger.test.ts tests/research-strategies.test.ts
shasum -a 256 -c docs/testing/ryo-bounty-demo-20261031/SHA256SUMS
```

Ten controlled tests passed, including later-quote fills, fee/gap accounting, missing prices, policy signatures, citation rejection and copied-post counting. These are test evidence only; they do not establish a genuine live-observed practice trade.

## Remaining acceptance

A genuine eligible BUY/SELL order and later practice fill have **not** been recorded. This remains the explicit gap against the brief’s practice-trade emphasis. It requires usable fresh required RYO data, supporting publications and a genuine model proposal that passes the unchanged signed rules, followed by a later eligible quote. Do not invent a trade, relax a signed policy, force model output or replay fixtures as live evidence. No strategy winner or Multi-KOL coverage is claimed.

No financial transaction, deployment or automatic research loop was started for this corrected demo. Source truth, completeness and actual model execution are not established by signatures or replay.
