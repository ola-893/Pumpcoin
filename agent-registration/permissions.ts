import { encodeFunctionData, getAddress, type Hex } from 'viem';
import { autonomousAbi } from './autonomous.js';
import { normalized, networkChecks, vaultArtifact, vaultClient, type VaultNetwork } from './vault-setup.js';
import { strategyBindingHash, riskBindingHash, type Prepared } from './core.js';

export async function permissionStatus(p: Prepared, vault: string, c: VaultNetwork, client: any = vaultClient(c)) {
  const address = getAddress(vault), block = await client.getBlock({ blockTag: 'latest' });
  await networkChecks(c, client, block.number);
  const artifact = vaultArtifact(), code = await client.getCode({ address, blockNumber: block.number });
  if (!code || normalized(code, artifact.deployedBytecode.immutableReferences) !== normalized(artifact.deployedBytecode.object, artifact.deployedBytecode.immutableReferences)) throw new Error('This vault needs the reviewed autonomy-enabled deployment before granting permissions.');
  const read = (functionName: string, args: unknown[] = []) => client.readContract({ address, abi: autonomousAbi, functionName, args, blockNumber: block.number });
  const names = ['admin', 'manager', 'registrationCommitment', 'currentConfigHash', 'paused', 'adapter', 'valuationSource', 'tradingPermission', 'managerVersion', 'tradeConfigVersion', 'strategyHash', 'riskHash', 'perTradeCap', 'maxPositionValue', 'asset', 'positionAsset'];
  const values = await Promise.all(names.map(n => read(n))), v = Object.fromEntries(names.map((n, i) => [n, values[i]]));
  if (v.admin.toLowerCase() !== p.manifest.controller.toLowerCase() || v.manager.toLowerCase() !== p.manifest.executionKey.toLowerCase()
    || v.registrationCommitment !== p.commitment || v.strategyHash !== strategyBindingHash(p) || v.riskHash !== riskBindingHash(p)
    || v.perTradeCap !== BigInt(p.manifest.proposedMandate.perTradeQuoteUnits) || v.maxPositionValue !== BigInt(p.manifest.proposedMandate.maxPositionQuoteUnits)
    || v.asset !== c.quote || v.positionAsset !== c.position) throw new Error('Current vault authority/configuration differs from this registration.');
  const spent = await read('dailyQuoteTraded', [block.timestamp / 86400n]);
  if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error('Chain changed during permission checks.');
  const permission = v.tradingPermission as readonly [bigint, number, bigint, bigint, bigint];
  return { vault: address, chainId: c.chainId, controller: p.manifest.controller, manager: p.manifest.executionKey, configHash: v.currentConfigHash as Hex, blockNumber: String(block.number),
    paused: v.paused as boolean, adapterConfigured: !/^0x0{40}$/i.test(v.adapter), validUntil: Number(permission[0]), maxSlippageBps: permission[1], dailyQuoteCap: String(permission[2]), dailyQuoteTraded: String(spent),
    active: !v.paused && BigInt(permission[0]) > block.timestamp && permission[3] === v.managerVersion && permission[4] === v.tradeConfigVersion };
}

export async function permissionPlan(p: Prepared, vault: string, c: VaultNetwork, action: 'grant' | 'revoke', input: { days: number; dailyQuoteCap: string }, client: any = vaultClient(c)) {
  const state = await permissionStatus(p, vault, c, client);
  let data: Hex;
  if (action === 'revoke') data = encodeFunctionData({ abi: autonomousAbi, functionName: 'revokeTradingPermission' });
  else {
    if (action !== 'grant' || !Number.isSafeInteger(input.days) || input.days < 1 || input.days > 30 || !/^[1-9]\d{0,18}$/.test(input.dailyQuoteCap)) throw new Error('Choose 1–30 days and a positive daily turnover limit in quote base units.');
    if (!state.adapterConfigured || state.paused) throw new Error('Configure and activate the reviewed venue and valuation before granting trading permission.');
    const block = await client.getBlock({ blockNumber: BigInt(state.blockNumber) });
    data = encodeFunctionData({ abi: autonomousAbi, functionName: 'grantTradingPermission', args: [getAddress(state.manager), state.configHash, block.timestamp + BigInt(input.days * 86400), BigInt(input.dailyQuoteCap), p.manifest.proposedMandate.slippageBps] });
  }
  await client.call({ account: getAddress(state.controller), to: state.vault, data });
  const gas = await client.estimateGas({ account: getAddress(state.controller), to: state.vault, data });
  return { chainId: c.chainId, from: getAddress(state.controller), to: state.vault, value: '0x0' as const, data, gas: `0x${(gas * 12n / 10n).toString(16)}` as Hex, action,
    scope: action === 'revoke' ? 'Revoke this agent’s trading permission immediately.' : `Grant the current agent ${input.days} days of trading with ${input.dailyQuoteCap} quote base units of UTC daily turnover and ${p.manifest.proposedMandate.slippageBps} bps slippage. No withdrawal or administration authority.` };
}
