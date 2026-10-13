# Historical credit archive

This is the preserved predecessor to PumpCoin's agent-vault product. It contains collateral-backed lending, financial-source eligibility, CRE report delivery, oracle ERC-8004 synchronization, the agent-credit SDK, repayment helpers, and their contracts, tests and deployment records.

These systems are outside the live agent-vault demo. Their historic results are not investment eligibility or trading-performance evidence for PumpCoin agents. [The original credit brief](README.historical.md) is retained as a historical record.

## Preservation and isolation

Source files were moved rather than deleted. Relative peer-module imports are preserved. Active defaults at the repository root build and test the vault product; this archive has separate opt-in commands.

`DemoToken` is shared test infrastructure still used by active vault regressions. Archived Foundry remappings reference that fixture and the existing root Foundry libraries. Expense compatibility in the active vault is retained because it is part of deployed runtime validation; new registrations use a zero expense budget.

Private root `.env` files, local registration records, signer keystores and live vault state are not part of this archive. The archived `.env.example` contains only example settings. Public historical deployment JSON and source evidence remain labeled historical.

## Optional regression checks

From the repository root, install archived Node dependencies separately when needed:

```sh
npm --prefix archive/credit install
npm --prefix archive/credit run typecheck
npm --prefix archive/credit run build:contracts
npm --prefix archive/credit test
npm --prefix archive/credit run test:contracts
```

Foundry libraries are shared with `contracts/lib/`. CRE workflow tests require Bun and the archived CRE dependencies. Operational commands in the historical brief must be run from `archive/credit/`; they are not part of the frontend demo. Never use archived deployment manifests as active vault bindings.

Archived Foundry regression commands skip the historical deployment scripts. Those scripts are preserved for reference; their previous compiler limitations are outside the active vault build.
