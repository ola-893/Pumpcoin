# PumpCoin local-model detection

Implemented 11 October 2026. Open the registration page on the local Vite dev or preview server on the same Mac as a running llama-server. Detection begins automatically, with retry and progress. No weights are uploaded and no generation request is issued.

## What is measured

The helper resolves the process listening on the configured loopback inference port. It checks its actual executable, matches `/v1/models` against `/props`, and requires the reported GGUF to be mapped by that process. It streams SHA-256 over the weights file and over the executable and mapped non-system `.dylib`, `.so` and `.metallib` artifacts. A sorted `PUMPCOIN-MAPPED-RUNTIME-v1` manifest is hashed for the runtime field. The manifest excludes the operating system, GPU driver, strategy, execution keys and any proof that the model performed a particular inference.

A `model-source.json` next to the GGUF can supply `repository`, a 40-hex pinned `revision`, `filename`, `size_bytes` and `sha256`. The helper uses it only when filename, size and freshly measured digest match. The source remains a local download record, not authenticated publisher provenance. If absent or mismatched, the source remains blank and the operator must provide it. The helper never executes provisioning scripts or guesses a source from the model alias.

Cache entries live only in the helper process and are keyed by resolved path, device, inode, byte count, modification and change times. Files are checked before/after reading and at completion. The process, mapped runtime and generation metadata are also rechecked at completion. A changed file or process fails the check. Local measurement is a point-in-time snapshot, not a guarantee against later host modifications.

## Boundaries

This initial automatic inspector supports macOS, one text-only GGUF, no LoRA and no multimodal projector. Other runners and configurations require explicit manual declarations until their inspector is implemented. Declared values do not gain a detected evidence label.

The helper is a Node-side Vite plugin, available in dev and local preview. A remotely hosted static website cannot inspect a visitor's files through it; the interface explicitly asks for the local app when the helper is absent. Do not deploy this route as a generic remote filesystem service.

Only literal loopback HTTP URLs with root or `/v1` paths are accepted, redirects are rejected, and response sizes/timeouts are bounded. No client-supplied file path is accepted. API requests require a loopback peer, allowlisted Host, matching Origin when present, and a same-origin session token for POST. Responses are non-cacheable and have no cross-origin read permission. Only one hash job runs at a time. `/status` reveals no filesystem paths, raw process arguments, secrets or weights.

Registration fills model ID, exact source when recovered, weights hash and runtime manifest hash. Editing these fields or the endpoint invalidates the detected metadata. Public exports retain `evidenceLevel: operator-declared`, add a scoped `locally-detected-not-attested` measurement record, and omit endpoint/local paths. The operator still chooses the controller, execution key, strategy and risk limits; strategy code cannot be inferred from model weights. Registration and investment remain disabled pending their separate backend gates.

## Validation

`node --import tsx --test tests/local-inference.test.ts tests/pumpcoin-frontend.test.ts` checks endpoint restrictions, process/runtime ambiguity, source substitution, actual hashing, cache invalidation, changes during reads, DNS rebinding/Origin/session-token checks, request-body restrictions, job deduplication, and export evidence boundaries. The integration test binds a disposable loopback HTTP server.

A real run on the current Mac measured Qwen3.8 27B IQ4_XS, 16,384 active context tokens and 14,252,845,984 weights bytes. Its measured SHA-256 matched the pinned local Unsloth download record. Runtime inspection covered the executable and twelve non-system mapped libraries. Browser tests use this real local server and check automatic filling, export privacy, draft restore, hosted and missing-server failures, invalidation/re-detection, and 390px layout.
