import test from "node:test";
import assert from "node:assert/strict";
import { makeCard, cardUri, type IdentityConfig } from "../oracle-identity/core.js";
import { zeroAddress } from "viem";
const root = "0x0000000000000000000000000000000000000001";
const writer = "0x0000000000000000000000000000000000000002";
const config: IdentityConfig = { chainId: 10143, rpcUrl: "https://testnet-rpc.monad.xyz", attestationRegistry: root,
  identityRegistry: writer, reputationRegistry: root, statusEndpoint: "https://proofline.example/status" };
test("revocation produces an inactive card without a verified wallet claim", () => {
  const card = makeCard(config, zeroAddress, root, "10143:3");
  assert.equal(card.active, false); assert.equal(card.walletAddress, zeroAddress);
  assert.equal(card.metadata.paymentWalletVerified, false);
});
test("rotation preserves identity and changes public writer", () => {
  const before = makeCard(config, root, root, "10143:3", true);
  const after = makeCard(config, writer, root, "10143:3", false);
  assert.deepEqual(before.registrations, after.registrations);
  assert.notEqual(before.walletAddress, after.walletAddress);
  assert.equal(JSON.parse(Buffer.from(cardUri(after).split(",")[1], "base64").toString()).metadata.oracleWriter, writer);
});
test("testnet cards require HTTPS endpoint", () => {
  assert.throws(() => makeCard({ ...config, statusEndpoint: "http://evil.example" }, writer, root), /HTTPS/);
});
