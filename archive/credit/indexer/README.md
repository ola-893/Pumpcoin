# Envio event configuration

The earlier indexer milestone has not been built or deployed yet. This patch supplies its corrected event configuration, not a running GraphQL service or event handlers.

After `forge build --root contracts`, configure the three deployed Monad addresses, `MONAD_TESTNET_RPC_URL`, and `ENVIO_START_BLOCK` (the earliest contract deployment receipt block) in the root `.env`. Run `npm run indexer:config` from the project root. This generates `indexer/config.yaml` from the compiled ABIs and retains the registry events. RPC credentials stay in the runtime environment.

The vault events are `RepaymentVault.Delegated`, `Revoked`, and `RepaidOnBehalf`, plus budget deposits and withdrawals. No `AgentVault.Executed` event or `AGENT_VAULT_ADDRESS` configuration remains. Use Envio's current [configuration format](https://docs.envio.dev/docs/HyperIndex/configuration-file) and regenerate handler types when connecting the indexer milestone.

Handler requirements for that milestone:

- Key borrower budgets by chain, vault address, and borrower. Deposits add funds; withdrawals and delegated repayments subtract them.
- Key grants by chain, vault address, and agent key. `Delegated` resets cumulative spending for an explicit renewal; `Revoked` disables the grant; `RepaidOnBehalf` increases spending. Expiry is a timestamp comparison, not an event.
- `CreditLine.Repaid` is the canonical debt reduction event for **both** direct and delegated repayments. `RepaidFor` records the payer, and `RepaidOnBehalf` records vault spending. Do not reduce debt three times for one transaction.
- Use chain ID, transaction hash, and log index for event IDs; let Envio handle reorg rollback. Index no raw income proofs or API credentials.
- Borrower ERC-8004 identity indexing is deliberately deferred pending confirmation of transfer-risk handling.
