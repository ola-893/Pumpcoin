# Hosting

## Netlify

Production: **https://pump-ryo.netlify.app**.

Netlify serves the frontend and a public evidence-reader API. It publishes exact signed registrations and a verified historical practice checkpoint, retaining raw provider responses, signed policy, decisions and ledger events. Public RPC observations use the chain signed by each registration (Sepolia or historical Monad). The hosted process cannot observe the operator's running model.

This deployment sets `PUMPCOIN_HOSTED_READ_ONLY=true`: registration, inference, new observations, transaction reviews and funded execution remain in the local operator app. The interface labels this boundary. No controller private key, execution keystore, model endpoint, RYO credential or root `.env` is uploaded. Public chain observations and connected-wallet balances can still be read.

Build from a clean checkout with Node 22:

```sh
npm ci
npm run build:netlify
npx netlify deploy --prod --no-build
```

`netlify.toml` supplies API rewrites, SPA routing and asset/security headers. `build-netlify.mjs` packages the API with public data, reduced reviewed contract artifacts and original research source files required for engine-digest verification. Builds use committed public snapshots, without accessing a developer's `.local` directory or requiring Foundry on Netlify.

To deliberately update public evidence locally:

```sh
node --import tsx scripts/export-hosted-public.ts
node --import tsx scripts/export-hosted-evidence.ts docs/testing/ryo-bounty-demo-20261031/checkpoint-eight-observations.json
```

The second exporter verifies signatures and deterministic replay before writing `deployments/hosted-research.json`. It also exports reduced artifacts from the reviewed Foundry build into `deployments/hosted-contracts.json`. Rebuilding those artifacts requires Foundry and the pinned Solidity dependencies. The snapshot's eight observations include two HOLD decisions and six inference errors, with no practice fills. Publication does not upgrade outcomes or prove model execution.

Configure a separate random `PUMPCOIN_HOSTED_SESSION_SECRET` (at least 32 characters) as a server-only Netlify environment variable. A manual CLI deployment is configured; pushing to GitHub alone does not enable automatic deployment.

Verification: `/api/health`, `/api/agent-registration/status`, and session-authenticated `/records`, `/research-state`, `/research-history`, `/research-export` under `/api/agent-registration`. Export hashes must match the committed snapshot. Unknown origins and local operator actions are rejected. `tests/netlify-hosting.test.ts` checks the adapter and these boundaries.

## Vercel (alternative)

The hosted app uses Vercel for the frontend and Node API, with a private Vercel Blob store retaining exact native-investment and pool-funding transaction reviews across cold starts. Wallet signing remains in the browser. Infrastructure addresses, runtime pins and historical signed public registrations ship with the deployment. Secrets stay in server-only environment variables.

The local Vite plugins continue to handle operator registration, model measurements, encrypted execution signing, and trader start/stop. Those loopback-only capabilities are not exposed by the hosted API. The public API reports local worker state as unobservable. It cannot start a trader or refresh prices using a local keeper. Existing Monad contracts and their readiness checks remain authoritative; hosting does not make a paused vault or stale valuation investment-ready.

## Refresh the public directory and deploy

```sh
node --import tsx scripts/export-hosted-public.ts
npm run typecheck
npm test
npm run build
node scripts/package-vercel.mjs
```

The exporter verifies historical enrollment signatures and copies only public registration records and contract addresses/receipt hashes. It never copies `.local` private runtime configurations, keystores, unlock files, deployment journals, or root environment files. Update the published snapshot after enrolling an agent or provisioning infrastructure locally.

`package-vercel.mjs` assembles the checked frontend, API source, and reduced contract artifacts into `/private/tmp/pumpcoin-vercel-files.json` for the deployment API. It does not push or commit existing work. The upload uses `npm ci` for API dependencies and the prebuilt frontend. Normal Vercel builds use the root `vercel.json`; contract artifacts must be supplied from the reviewed local Foundry build, because generated artifacts are ignored by Git.

Server environment: `PUMPCOIN_HOSTED_SESSION_SECRET` (random 32-byte secret), `BLOB_READ_WRITE_TOKEN` (connected private Blob store), and `PUMPCOIN_PYTH_API_KEY` (existing server-only provider key). Never configure `PRIVATE_KEY`, execution keystores, or model URLs on the public API.

Verification endpoints: `/api/health`, `/api/agent-registration/status`, and authenticated `/api/agent-registration/records`. Session tokens are signed, expire in one hour, and bind to the deployment hostname. Read and wallet-review routes require same-origin requests and a valid token. Local operator routes return an explicit unavailable response.
