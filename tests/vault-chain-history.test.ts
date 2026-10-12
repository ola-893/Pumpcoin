import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { createPublicClient, createWalletClient, defineChain, http, keccak256, stringToHex, type Abi, type Address, type Hex } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { collectVaultHistory, verifyVaultExport, parseVaultExport } from '../vault/chain-history.js';
import { replay, replayEvidence } from '../vault/ledger.js';
import { NAV_POLICY_HASH, NAV_POLICY_VERSION, navOf, perShare } from '../vault/nav.js';
import { createRecordService, encryptRecord, buildPublicPackage } from '../vault/records.js';
import { onchainGrantResolver } from '../vault/record-grants.js';
execFileSync('forge', ['build', '--root', 'contracts'], { stdio: 'ignore' });
const artifact = (name: string) => JSON.parse(readFileSync(`contracts/out/${name}.sol/${name}.json`, 'utf8')) as {
    abi: Abi;
    bytecode: {
        object: Hex;
    };
};
const server = createServer();
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const port = (server.address() as {
    port: number;
}).port;
await new Promise<void>(r => server.close(() => r()));
const rpc = `http://127.0.0.1:${port}`;
const anvil: ChildProcess = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--silent'], { stdio: 'ignore' });
after(() => anvil.kill('SIGTERM'));
const chain = defineChain({ id: 31337, name: 'Unora vault simulation', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const client = createPublicClient({ chain, transport: http(rpc), cacheTime: 0, pollingInterval: 25 });
const accounts = Array.from({ length: 4 }, () => privateKeyToAccount(generatePrivateKey()));
const wallets = accounts.map(account => createWalletClient({ account, chain, transport: http(rpc) }));
const receipts: Array<{
    action: string;
    hash: Hex;
    status: string;
    block: bigint;
}> = [];
async function call(signer: number, address: Address, name: string, fn: string, args: readonly unknown[] = [], expect = 'success') {
    const hash = await wallets[signer].writeContract({ address, abi: artifact(name).abi, functionName: fn, args, gas: 5000000n });
    const r = await client.waitForTransactionReceipt({ hash });
    assert.equal(r.status, expect, fn);
    receipts.push({ action: fn, hash, status: r.status, block: r.blockNumber });
    return r;
}
async function deploy(name: string, args: readonly unknown[]) { const a = artifact(name); const hash = await wallets[0].deployContract({ abi: a.abi, bytecode: a.bytecode.object, args, gas: 10000000n }); const r = await client.waitForTransactionReceipt({ hash }); assert.equal(r.status, 'success', name); assert.ok(r.contractAddress); return { address: r.contractAddress, block: r.blockNumber }; }
async function read(address: Address, name: string, fn: string, args: readonly unknown[] = []) { return client.readContract({ address, abi: artifact(name).abi, functionName: fn, args }); }
const M = 1000000n, STRAT = keccak256(stringToHex('spot-v1')), RISK = keccak256(stringToHex('risk-v1'));
let evidenceFile = '';
const setup = (async () => {
    for (let i = 0; i < 100; i++) {
        try {
            if (await client.getChainId() === 31337)
                break;
        }
        catch { }
        if (i === 99)
            throw new Error('anvil-startup');
        await new Promise(r => setTimeout(r, 50));
    }
    for (const a of accounts)
        await client.request({ method: 'anvil_setBalance' as never, params: [a.address, '0x56BC75E2D63100000'] as never });
    const quote = (await deploy('DemoToken', ['Quote', 'pUSD'])).address, position = (await deploy('DemoToken', ['Position', 'pAST'])).address;
    const source = (await deploy('VaultValuationSource', [accounts[0].address, 10n ** 18n, 3600])).address;
    const registry = (await deploy('MockERC8004Registry', [])).address;
    await call(0, registry, 'MockERC8004Registry', 'register', [accounts[1].address]);
    const vaultDeployment = await deploy('UnoraVault', [quote, position, source, accounts[0].address, accounts[1].address, STRAT, RISK, 500n * M, 800n * M, 100n * M, 1n * M, NAV_POLICY_HASH]);
    const vault = vaultDeployment.address;
    const adapter = (await deploy('RestrictedSpotAdapter', [vault, '0x0000000000000000000000000000000000000000', quote, position])).address;
    const venue = (await deploy('MockSpotVenue', [quote, position, adapter])).address;
    const stream = (await deploy('ServiceExpenseStream', [quote, vault, accounts[0].address])).address;
    await call(0, stream, 'ServiceExpenseStream', 'setRecipient', [accounts[3].address, true]);
    const config = { adapter, venue, stream, valuationSource: source, perTradeCap: 500n * M, maxPositionValue: 800n * M, expenseBudget: 100n * M, strategyHash: STRAT, riskHash: RISK, identityRegistry: registry, agentId: 1n };
    await call(0, vault, 'UnoraVault', 'proposeConfig', [config]);
    let now = (await client.getBlock()).timestamp;
    await client.request({ method: 'evm_setNextBlockTimestamp' as never, params: [Number(now + 86401n)] as never });
    await call(0, source, 'VaultValuationSource', 'updatePrice', [10n ** 18n]);
    await call(0, vault, 'UnoraVault', 'applyConfig');
    await call(0, quote, 'DemoToken', 'mint', [venue, 10000n * M]);
    await call(0, position, 'DemoToken', 'mint', [venue, 10000n * M]);
    for (const who of [0, 2]) {
        await call(0, quote, 'DemoToken', 'mint', [accounts[who].address, 10000n * M]);
        await call(who, quote, 'DemoToken', 'approve', [vault, 10000n * M]);
    }
    const fromBlock = (await client.getBlockNumber({ cacheTime: 0 })) + 1n;
    const deposit = await call(0, vault, 'UnoraVault', 'deposit', [1000n * M, accounts[0].address]);
    // Deliberate unsolicited dust, actual transfers/mints to adapter; neither changes vault NAV.
    await call(0, quote, 'DemoToken', 'transfer', [adapter, 1n]);
    await call(0, position, 'DemoToken', 'mint', [adapter, 1n]);
    now = (await client.getBlock()).timestamp;
    await call(1, vault, 'UnoraVault', 'managerTrade', [quote, position, 400n * M, 400n * M, now + 3600n, venue]);
    await call(2, vault, 'UnoraVault', 'managerTrade', [quote, position, 1n * M, 1n * M, now + 3600n, venue], 'reverted');
    await call(0, source, 'VaultValuationSource', 'updatePrice', [12n * 10n ** 17n]);
    const before = await read(vault, 'UnoraVault', 'convertToAssets', [await read(vault, 'UnoraVault', 'balanceOf', [accounts[0].address])]);
    await call(2, vault, 'UnoraVault', 'deposit', [108n * M, accounts[2].address]);
    const afterEntry = await read(vault, 'UnoraVault', 'convertToAssets', [await read(vault, 'UnoraVault', 'balanceOf', [accounts[0].address])]);
    assert.equal(afterEntry, before);
    await call(0, source, 'VaultValuationSource', 'updatePrice', [8n * 10n ** 17n]);
    const obligationId = keccak256((await import('viem')).encodeAbiParameters((await import('viem')).parseAbiParameters('uint256,address,uint256'), [31337n, stream, 7n]));
    const nav = await read(vault, 'UnoraVault', 'totalAssets');
    await call(0, vault, 'UnoraVault', 'fundServiceExpense', [50n * M, keccak256(stringToHex('data-service')), accounts[3].address, 7n]);
    assert.equal(await read(vault, 'UnoraVault', 'totalAssets'), nav);
    await call(0, vault, 'UnoraVault', 'accrueServiceExpense', [30n * M]);
    await call(0, vault, 'UnoraVault', 'settleServiceExpense', [obligationId, 30n * M, 1n]);
    await call(0, vault, 'UnoraVault', 'refundServiceExpense', [obligationId, 20n * M, 1n]);
    assert.equal(await read(vault, 'UnoraVault', 'totalAssets'), 998n * M);
    const strategy2 = keccak256(stringToHex('spot-v2'));
    await call(0, vault, 'UnoraVault', 'proposeConfig', [{ ...config, strategyHash: strategy2 }]);
    now = (await client.getBlock()).timestamp;
    await client.request({ method: 'evm_setNextBlockTimestamp' as never, params: [Number(now + 86401n)] as never });
    await call(0, source, 'VaultValuationSource', 'updatePrice', [8n * 10n ** 17n]);
    await call(0, vault, 'UnoraVault', 'applyConfig');
    await call(0, registry, 'MockERC8004Registry', 'transferFrom', [accounts[0].address, accounts[2].address, 1n]);
    await call(2, registry, 'MockERC8004Registry', 'rotateController', [1n, accounts[2].address]);
    now = (await client.getBlock()).timestamp;
    await call(2, vault, 'UnoraVault', 'managerTrade', [quote, position, 1n * M, 1n * M, now + 3600n, venue], 'reverted');
    const shares = await read(vault, 'UnoraVault', 'balanceOf', [accounts[0].address]) as bigint;
    await call(0, vault, 'UnoraVault', 'redeem', [shares / 10n, accounts[0].address, accounts[0].address]);
    const toBlock = await client.getBlockNumber({ cacheTime: 0 });
    const bundle = await collectVaultHistory(client, { vault, deploymentBlock: vaultDeployment.block, fromBlock, toBlock });
    assert.equal(bundle.report.status, 'ok', bundle.report.status === 'ok' ? '' : bundle.report.reason);
    if (bundle.report.status !== 'ok')
        throw new Error('bad-report');
    assert.equal(bundle.report.netPnl, -110n * M);
    const dir = mkdtempSync(join(tmpdir(), 'unora-vault-evidence-'));
    evidenceFile = join(dir, 'vault-local-evidence.json');
    const sources = ['contracts/src/vault/UnoraVault.sol', 'contracts/src/vault/RestrictedSpotAdapter.sol', 'contracts/src/vault/ServiceExpenseStream.sol', 'contracts/src/vault/VaultValuationSource.sol', 'contracts/src/vault/MockERC8004Registry.sol', 'vault/nav.ts', 'vault/ledger.ts', 'vault/chain-history.ts', 'vault/records.ts', 'vault/record-grants.ts'];
    const sourceHashes = Object.fromEntries(sources.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
    writeFileSync(evidenceFile, JSON.stringify({ environment: 'simulation', managerExecution: 'scripted signed transactions; not an LLM or an autonomous worker claim', navPolicyVersion: NAV_POLICY_VERSION, navPolicyHash: NAV_POLICY_HASH, sourceHashes, addresses: { vault, quote, position, source, adapter, venue, stream, registry }, receipts, bundle }, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n');
    console.log(`Vault evidence artifact: ${evidenceFile}`);
    return { vault, quote, position, source, registry, stream, adapter, venue, fromBlock, bundle, strategy2, deploymentBlock: vaultDeployment.block };
})();
test('Local vault journey reconciles mined receipts, shares, costs, losses, strategy and identity changes', async () => { const s = await setup; assert.equal(s.bundle.report.status, 'ok'); assert.equal(replayEvidence(s.bundle.report, 'simulation').label, 'execution-verified'); assert.ok(evidenceFile); });
test('Missing individual same-block economic log is rejected against independently collected receipts', async () => { const { bundle } = await setup; const missing = bundle.events.filter((_, i) => i !== bundle.events.findIndex(e => e.kind === 'transfer' && e.emitter.toLowerCase() === bundle.coverage.vault.toLowerCase())); assert.equal(replay(missing, bundle.coverage).status, 'inconsistent'); const missingSettlement = bundle.events.filter(e => e.kind !== 'settle'); assert.equal(replay(missingSettlement, bundle.coverage).status, 'inconsistent'); });
test('Stale share transactions fail and emergency rotation keeps performance unavailable', async () => {
    const s = await setup;
    const now = (await client.getBlock()).timestamp;
    await client.request({ method: 'evm_setNextBlockTimestamp' as never, params: [Number(now + 3601n)] as never });
    await client.request({ method: 'evm_mine' as never, params: [] as never });
    await call(2, s.vault, 'UnoraVault', 'deposit', [1n * M, accounts[2].address], 'reverted');
    await call(0, s.vault, 'UnoraVault', 'rotateManager', [accounts[3].address, s.strategy2, RISK]);
    const bad = await collectVaultHistory(client, { vault: s.vault, deploymentBlock: s.deploymentBlock, fromBlock: s.fromBlock, toBlock: await client.getBlockNumber({ cacheTime: 0 }) });
    assert.equal(bad.report.status, 'unavailable');
    await call(0, s.source, 'VaultValuationSource', 'updatePrice', [8n * 10n ** 17n]);
    await call(0, s.vault, 'UnoraVault', 'rotateManager', [accounts[1].address, s.strategy2, RISK]);
});
test('Investor checks public evidence and exports only own records with current onchain role checks', async () => {
    const s = await setup, key = randomBytes(32);
    const service = createRecordService({ resolveGrant: onchainGrantResolver(client), records: [{ id: 'strategy', key, record: encryptRecord(key, s.vault, 'strategy-private', 1, accounts[1].address, Buffer.from('private strategy')) }, { id: 'statement', key, record: encryptRecord(key, s.vault, 'investor-personal', 1, accounts[2].address, Buffer.from('investor statement')) }] });
    const c = service.challengeExport(accounts[2].address, s.vault, 31337);
    const exported = await service.export(c.id, await accounts[2].signMessage({ message: c.message }));
    assert.equal(exported.length, 1);
    assert.equal(exported[0].id, 'statement');
    const pub = buildPublicPackage({ vault: s.vault, periods: s.bundle.events.filter(e => e.kind === 'config').map(e => ({ id: Number(e.periodId), strategyHash: e.strategyHash!, manager: e.manager!, startBlock: e.block, endBlock: null })), navHistory: [{ block: s.bundle.coverage.toBlock, nav: String(s.bundle.coverage.closing.cash + s.bundle.coverage.closing.positionBalance * 8n / 10n), sharePrice: String(perShare(navOf({ ...s.bundle.coverage.closing, escrow: s.bundle.coverage.closing.managedEscrow }), s.bundle.coverage.closing.totalShares)) }], settledExpenses: [] });
    assert.ok(!JSON.stringify(pub).includes('private strategy'));
});
test('Untrusted export cannot fabricate its own expected events or checkpoints', async () => {
    const s = await setup, expected = { chainId: 31337, vault: s.vault, deploymentBlock: s.deploymentBlock };
    assert.equal((await verifyVaultExport(client, expected, parseVaultExport(readFileSync(evidenceFile, 'utf8')))).status, 'ok');
    const fake = structuredClone(s.bundle);
    fake.events = [];
    fake.coverage.receiptEvents = [];
    assert.equal((await verifyVaultExport(client, expected, fake)).status, 'inconsistent');
    const altered = structuredClone(s.bundle);
    altered.coverage.closing.cash += 1n;
    assert.equal((await verifyVaultExport(client, expected, altered)).status, 'inconsistent');
});
test('Receipt collection rejects a reorg and a missing receipt rather than returning partial history', async () => {
    const s = await setup;
    let seen = 0;
    const reorgClient = new Proxy(client, { get(target, key) { if (key !== 'getBlock')
            return Reflect.get(target, key); return async (args: Parameters<typeof client.getBlock>[0]) => { const block = await client.getBlock(args); if (args?.blockNumber === s.fromBlock - 1n && ++seen === 2)
            return { ...block, hash: keccak256(stringToHex('reorg')) }; return block; }; } });
    await assert.rejects(collectVaultHistory(reorgClient, { vault: s.vault, deploymentBlock: s.deploymentBlock, fromBlock: s.fromBlock, toBlock: BigInt(s.bundle.coverage.toBlock) }), /reorg/);
    const missingClient = new Proxy(client, { get(target, key) { if (key === 'getTransactionReceipt')
            return async () => { throw new Error('missing-receipt'); }; return Reflect.get(target, key); } });
    await assert.rejects(collectVaultHistory(missingClient, { vault: s.vault, deploymentBlock: s.deploymentBlock, fromBlock: s.fromBlock, toBlock: BigInt(s.bundle.coverage.toBlock) }), /missing-receipt/);
});
