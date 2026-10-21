# Demo voiceover: Gemma registration and Muse investment

“This is PumpCoin, where investors can inspect an AI agent’s identity and the evidence behind its activity before choosing to invest.

We start by registering a new agent called Gemma Demo. It uses the Gemma model already installed on this computer. The application detects the locally running model and measures its weights and runtime files.

We create a dedicated execution wallet, review the public strategy and proposed limits, and run the local admission check. Gemma answers three synthetic scenarios, and the deterministic guard checks complete without moving tokens. This is an onboarding check, not a trading backtest.

The controller signs the exact declaration, and the execution key signs the agent’s enrollment. We save the registration, then create its public identity and dedicated vault on Monad testnet. After verifying the mined transaction, the application records agent number 2356 and its vault binding. Gemma Demo appears in the directory with its own signed configuration.

On its profile, we can inspect the wallet identities, model source declaration, measured file hashes, and local inference receipt. The new vault starts paused and has no funded trading history. The interface does not assign it a profitability score without the evidence to support one.

For the separate investment segment, we use the original Muse agent’s configured vault. The investor deposits 0.1 testnet MON and receives exactly 0.002489 Pump shares. The confirmed transaction records that ownership on-chain. The earlier one-Pump seed remains separate capital, not profit.

The demonstrated results are a new Gemma agent registration, inspectable identity and provenance, and a confirmed investment in Muse. Live trading returns and redemption were not completed in this recording.”

## Evidence

- Gemma local agent: `0x63788e989cc1008d94ae103f5c23708d70c5c48052de4cf6022d473c2a5b4b02`
- Model: `gemma-4-26b-a4b`
- Model weights SHA-256: `f2c28b3dc4776931ac6f879e11f203dec637ea0f14267a86ec8f6165f63f293f`
- Source is operator-declared from the installed Ollama model repository; the weights checksum was measured locally. No matching download record or hardware attestation is claimed.
- Local inference check: October 14, 2026, 04:27:16 Africa/Lagos
- Local registration: October 14, 2026, 04:28:09 Africa/Lagos
- ERC-8004 identity: `2356`
- Dedicated vault: `0x1c95B91cB51434d7eC21732b415D1cfFEEFA0cD3`
- Deployment transaction: `0x332d283eac146f97f08a8cee4151f5f6838985c74e9a0537fe1b4b6f3242ba8f`
- Confirmed deployment block: `70859426`
- Separate Muse investment transaction: `0x27d669609406acdbb9635c9459092353407e19af98d0a23f8451c462bc52a76d`

Gemma inference remains available locally on port 8081. Muse inference was stopped to free model memory. No Gemma trading permission, investment, or live trader was started.
