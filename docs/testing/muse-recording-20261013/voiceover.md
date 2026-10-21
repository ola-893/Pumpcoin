# Muse demo voiceover

This recording demonstrates a new Muse Demo agent registration, including local inference, signatures, and confirmed public identity and vault creation. The earlier investment segment used the original Muse vault. It does not demonstrate a completed redemption or verified trading returns.

## Spoken script

“This is PumpCoin, where investors can inspect an AI agent’s identity and the evidence behind its activity before choosing to invest.

We begin by registering a new agent called Muse Demo. The application detects the locally running Muse model and measures its model and runtime files. We prepare a dedicated execution wallet, review the strategy and limits, and run the local inference admission check.

The controller signs the declaration, and the agent’s execution key signs its own enrollment. After saving those authorizations, we create its public identity and dedicated vault on Monad testnet. The application verifies the mined deployment, and Muse Demo appears in the agent directory. Its new vault starts paused, with no deposits or trading history.

Next, we inspect Muse’s evidence: its declared model, recorded model and runtime measurements, signed strategy, wallet identities, and vault commitments. The onboarding inference receipt is clearly identified as a synthetic check. It is separate from real trading activity.

The interface also identifies the block and observation time behind the displayed chain state. When evidence is incomplete or stale, it says so. This demo does not establish Muse’s profitability or a performance-based trust score.

For the investment segment, we use the original Muse agent’s existing configured vault. The investor chooses to invest 0.1 testnet MON. The transaction confirms on Monad testnet and mints exactly 0.002489 Pump shares. Those shares record the investor’s ownership in that vault. The earlier one-Pump seed is separate capital, not profit.

That completes the working flow shown here: a new agent registration with local inference and public identity, inspectable provenance, and a separate on-chain investment with Pump shares. Live trading performance and redemption remain unfinished and are outside this recording’s demonstrated results.”

## New registration evidence

- Name: `Muse Demo`
- Local agent identity: `0x13e7f97c19441cec3de86784b9297fd1b10c07e29b3f0e393821f00ed3c97f46`
- Local inference checked: October 14, 2026, 04:18:49 Africa/Lagos
- Signed registration saved: October 14, 2026, 04:19:33 Africa/Lagos
- Execution wallet: `0x5b7D85d534DEca2D7fca964165D0918d1AE40d23`
- Manifest commitment: `0x58225a73a25ff0c139ab7231e09ae6e2de36fb63b244d11ec5585237d79d66e5`
- New dedicated vault: `0x867D68B7dd99064E7e75949069FbF01E6385c614`
- Confirmed deployment transaction: `0x5e4be0cb208fdf6b964461fdacb513c6981c99f56359ea20b63ae85cf4f63e97`
- Confirmed deployment block: `70857725`
- Result: public identity and vault binding recorded; vault paused, zero capital, no trading permission granted.

## Confirmed investment evidence

- Investor: `0xe26468ae02368a75DBDBea58F367B7313942ad26`
- Transaction: `0x27d669609406acdbb9635c9459092353407e19af98d0a23f8451c462bc52a76d`
- Confirmed block: `70791086`
- Deposit: `0.1` testnet MON
- Shares minted: `0.002489` Pump
- Resulting total shares: `1.002489` Pump, including the separate `1` Pump seed
- Redemption did not complete; no redemption proceeds were received.

The keeper is disabled and the local trader is stopped. The local inference server and application remain running.
