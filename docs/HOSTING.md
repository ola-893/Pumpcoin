# Vercel deployment

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
