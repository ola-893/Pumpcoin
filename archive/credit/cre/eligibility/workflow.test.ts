import assert from "node:assert/strict";
import { test, newTestRuntime, HttpActionsMock, EvmMock, REPORT_METADATA_HEADER_LENGTH } from "@chainlink/cre-sdk/test";
import { getNetwork, type HTTPPayload } from "@chainlink/cre-sdk";
import { bytesToHex, decodeAbiParameters, encodeAbiParameters, keccak256, stringToHex } from "viem";
import { onEligibilityRequest, initWorkflow, type Config } from "./workflow.js";
import { REPORT_ABI, POLICY_VERSION, DAY } from "../../eligibility/policy.js";

const now = 1_800_000_000;
const config: Config = {
  chainId: 10143, registry: "0x1111111111111111111111111111111111111111",
  receiver: "0x3333333333333333333333333333333333333333", providerId: "fixture", providerVersion: "v1",
  allowFixtures: true, allowTestMode: true, verifierUrl: "http://127.0.0.1:8788", authorizedEVMAddress: "", writeReport: false,
};
const digest = (s: string) => keccak256(stringToHex(s));
const facts = {
  ...config, evidenceKind: "fixture", subject: "0x2222222222222222222222222222222222222222",
  sourceId: digest("account"), proofHash: digest("proof"), sessionId: digest("session"),
  observedAt: now, windowStart: now - DAY * 90, windowEnd: now,
  totalPayoutCents: "150000", currency: "USD", complete: true, testMode: true,
};
const payload = { input: new TextEncoder().encode('{"receiptId":"fixture-demo"}') } as HTTPPayload;
function runtime(c = config) {
  return newTestRuntime<Config>(new Map([["main", new Map([["VERIFIER_API_TOKEN", "test-secret"]])]]),
    { timeProvider: () => now * 1000 }, c);
}
function serve(body: unknown = facts, status = 200) {
  HttpActionsMock.testInstance().sendRequest = input => {
    assert.equal(input.url, "http://127.0.0.1:8788/facts/fixture-demo");
    assert.equal(input.headers.Authorization, "Bearer test-secret");
    return { statusCode: status, body: Buffer.from(JSON.stringify(body)).toString("base64") };
  };
}
test("CRE HTTP capability, identical aggregation, policy and ABI encoding", () => {
  serve();
  const rt = runtime();
  const encoded = onEligibilityRequest(rt, payload) as `0x${string}`;
  const [chain, destination, report] = decodeAbiParameters(REPORT_ABI, encoded);
  assert.equal(chain, 10143n); assert.equal(destination.toLowerCase(), config.registry);
  assert.equal(report.tier, 2); assert.equal(report.ceiling, 80_000_000n);
  assert.equal(rt.getLogs().join(" ").includes("150000"), false);
  assert.equal(rt.getLogs().join(" ").includes("test-secret"), false);
});
test("CRE confirms broadcast only with receipt and matching registry state", () => {
  serve();
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: "monad-testnet", isTestnet: true })!;
  const mock = EvmMock.testInstance(network.chainSelector.selector);
  const txHashB64 = Buffer.alloc(32, 1).toString("base64");
  let wrote = false;
  mock.writeReport = input => {
    wrote = true;
    assert.equal(bytesToHex(input.receiver), config.receiver);
    assert.ok(input.report);
    const body = bytesToHex(input.report.rawReport.slice(REPORT_METADATA_HEADER_LENGTH));
    assert.equal(decodeAbiParameters(REPORT_ABI, body)[2].ceiling, 80_000_000n);
    return { txStatus: "TX_STATUS_SUCCESS", receiverContractExecutionStatus: "RECEIVER_CONTRACT_EXECUTION_STATUS_SUCCESS", txHash: txHashB64 };
  };
  mock.getTransactionReceipt = input => {
    assert.equal(bytesToHex(input.hash), "0x" + "01".repeat(32));
    return { receipt: { status: "1", txHash: txHashB64, logs: [] } };
  };
  mock.callContract = input => {
    assert.equal(bytesToHex(input.call!.to), config.registry.toLowerCase());
    return { data: Buffer.from(encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" },
       { type: "uint8" }, { type: "uint64" }, { type: "uint64" }, { type: "uint256" }],
      [facts.subject, facts.sourceId, facts.proofHash, facts.sessionId, POLICY_VERSION, 2, BigInt(now), BigInt(now + 7 * DAY), 80_000_000n],
    ).slice(2), "hex").toString("base64") };
  };
  const out = JSON.parse(onEligibilityRequest(runtime({ ...config, writeReport: true }), payload));
  assert.equal(out.mode, "CONFIRMED_DELIVERY");
  assert.equal(out.txHash, "0x" + "01".repeat(32));
  assert.equal(out.registry.toLowerCase(), config.registry);
  assert.equal(wrote, true);
});
test("CRE rejects broadcast when the transaction receipt fails", () => {
  serve();
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: "monad-testnet", isTestnet: true })!;
  const mock = EvmMock.testInstance(network.chainSelector.selector);
  const txHashB64 = Buffer.alloc(32, 2).toString("base64");
  mock.writeReport = () => ({ txStatus: "TX_STATUS_SUCCESS",
    receiverContractExecutionStatus: "RECEIVER_CONTRACT_EXECUTION_STATUS_SUCCESS", txHash: txHashB64 });
  mock.getTransactionReceipt = () => ({ receipt: { status: "0", txHash: txHashB64, logs: [] } });
  assert.throws(() => onEligibilityRequest(runtime({ ...config, writeReport: true }), payload), /receipt missing or unsuccessful/);
});
test("CRE rejects broadcast when registry state does not match the report", () => {
  serve();
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: "monad-testnet", isTestnet: true })!;
  const mock = EvmMock.testInstance(network.chainSelector.selector);
  const txHashB64 = Buffer.alloc(32, 3).toString("base64");
  mock.writeReport = () => ({ txStatus: "TX_STATUS_SUCCESS",
    receiverContractExecutionStatus: "RECEIVER_CONTRACT_EXECUTION_STATUS_SUCCESS", txHash: txHashB64 });
  mock.getTransactionReceipt = () => ({ receipt: { status: "1", txHash: txHashB64, logs: [] } });
  mock.callContract = () => ({ data: Buffer.from(encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" },
     { type: "uint8" }, { type: "uint64" }, { type: "uint64" }, { type: "uint256" }],
    [facts.subject, facts.sourceId, facts.proofHash, facts.sessionId, POLICY_VERSION, 2, BigInt(now), BigInt(now + 7 * DAY), 0n],
  ).slice(2), "hex").toString("base64") });
  assert.throws(() => onEligibilityRequest(runtime({ ...config, writeReport: true }), payload), /registry state does not match/);
});
test("CRE rejects verifier failures and fixture evidence on authenticated configuration", () => {
  serve(facts, 403);
  assert.throws(() => onEligibilityRequest(runtime(), payload));
  serve();
  assert.throws(() => onEligibilityRequest(runtime({ ...config, allowFixtures: false }), payload));
  assert.throws(() => initWorkflow({ ...config, allowFixtures: false }));
});
test("CRE rejects caller URL injection before making a request", () => {
  assert.throws(() => onEligibilityRequest(runtime(), {
    input: new TextEncoder().encode('{"receiptId":"../secrets"}'),
  } as HTTPPayload));
});

test("CRE does not report success when receiver execution reverts", () => {
  serve();
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: "monad-testnet", isTestnet: true })!;
  EvmMock.testInstance(network.chainSelector.selector).writeReport = () => ({
    txStatus: "TX_STATUS_SUCCESS", receiverContractExecutionStatus: "RECEIVER_CONTRACT_EXECUTION_STATUS_REVERTED",
  });
  assert.throws(() => onEligibilityRequest(runtime({ ...config, writeReport: true }), payload), /delivery failed/);
});
test("CRE never establishes success from a missing receiver execution status", () => {
  serve();
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: "monad-testnet", isTestnet: true })!;
  EvmMock.testInstance(network.chainSelector.selector).writeReport = () => ({
    txStatus: "TX_STATUS_SUCCESS", txHash: Buffer.alloc(32, 9).toString("base64"),
  });
  assert.throws(() => onEligibilityRequest(runtime({ ...config, writeReport: true }), payload),
    /missing receiver execution status/);
});
test("CRE labels a missing transaction hash as a dry run, never as delivery", () => {
  serve();
  const encoded = onEligibilityRequest(runtime(), payload) as `0x${string}`;
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: "monad-testnet", isTestnet: true })!;
  EvmMock.testInstance(network.chainSelector.selector).writeReport = () => ({
    txStatus: "TX_STATUS_SUCCESS", receiverContractExecutionStatus: "RECEIVER_CONTRACT_EXECUTION_STATUS_SUCCESS",
  });
  const out = JSON.parse(onEligibilityRequest(runtime({ ...config, writeReport: true }), payload));
  assert.equal(out.mode, "DRY_RUN_NOT_BROADCAST");
  assert.equal(out.reportDigest, keccak256(encoded));
  assert.ok(!("txHash" in out));
});
test("CRE labels an empty transaction hash as a dry run, never as delivery", () => {
  serve();
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: "monad-testnet", isTestnet: true })!;
  EvmMock.testInstance(network.chainSelector.selector).writeReport = () => ({
    txStatus: "TX_STATUS_SUCCESS", receiverContractExecutionStatus: "RECEIVER_CONTRACT_EXECUTION_STATUS_SUCCESS",
    txHash: "",
  });
  const out = JSON.parse(onEligibilityRequest(runtime({ ...config, writeReport: true }), payload));
  assert.equal(out.mode, "DRY_RUN_NOT_BROADCAST");
  assert.ok(!("txHash" in out));
});
