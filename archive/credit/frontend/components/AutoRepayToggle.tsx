"use client";

import { useState } from "react";
import { getAddress, parseAbi, parseUnits, type Address, type PublicClient, type WalletClient } from "viem";
import { enableAutoRepay } from "../lib/auto-repay.js";

const vaultAbi = parseAbi([
  "function token() view returns (address)",
  "function borrowerBalance(address) view returns (uint256)",
  "function delegations(address) view returns (address borrower,uint256 tokenBudget,uint256 spentToken,uint64 expiresAt,bool revoked)",
  "function depositBudget(uint256)", "function withdrawUnusedBudget(uint256)",
  "function delegate(address,uint256,uint64)", "function revoke(address)",
]);
const tokenAbi = parseAbi(["function decimals() view returns (uint8)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]);

export function AutoRepayToggle({ borrower, vault, publicClient, walletClient }: {
  borrower: Address; vault: Address; publicClient: PublicClient; walletClient: WalletClient;
}) {
  const [agentText, setAgentText] = useState("");
  const [budgetText, setBudgetText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function checkWallet() {
    const [connected] = await walletClient.getAddresses();
    const [readChain, walletChain] = await Promise.all([publicClient.getChainId(), walletClient.getChainId()]);
    if (readChain !== 10143 || walletChain !== readChain) throw new Error("Switch your wallet to Monad Testnet.");
    if (connected?.toLowerCase() !== borrower.toLowerCase()) throw new Error("Connect the borrower's wallet.");
  }
  async function confirmed(hash: `0x${string}`) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Transaction reverted; delegation was not completed.");
  }
  async function run(operation: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await checkWallet(); await operation(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Transaction failed."); }
    finally { setBusy(false); }
  }
  async function enable() {
    const agent = getAddress(agentText);
    const token = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "token" });
    const decimals = await publicClient.readContract({ address: token, abi: tokenAbi, functionName: "decimals" });
    if (!/^\d+(\.\d+)?$/.test(budgetText) || (budgetText.split(".")[1]?.length ?? 0) > decimals) throw new Error("Enter a valid token amount.");
    const budget = parseUnits(budgetText, decimals);
    const expiry = (await publicClient.getBlock()).timestamp + 30n * 86400n;
    await enableAutoRepay({
      budgetBalance: () => publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "borrowerBalance", args: [borrower] }),
      allowance: () => publicClient.readContract({ address: token, abi: tokenAbi, functionName: "allowance", args: [borrower, vault] }),
      delegationBorrower: async key => (await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "delegations", args: [key] }))[0],
      approve: async amount => { await checkWallet(); setMessage("Approve the repayment budget in your wallet."); await confirmed(await walletClient.writeContract({ address: token, abi: tokenAbi, functionName: "approve", args: [vault, amount], account: borrower, chain: walletClient.chain })); },
      deposit: async amount => { await checkWallet(); setMessage("Deposit your repayment budget."); await confirmed(await walletClient.writeContract({ address: vault, abi: vaultAbi, functionName: "depositBudget", args: [amount], account: borrower, chain: walletClient.chain })); },
      delegate: async (key, amount, until) => { await checkWallet(); setMessage("Authorize the repayment key."); await confirmed(await walletClient.writeContract({ address: vault, abi: vaultAbi, functionName: "delegate", args: [key, amount, until], account: borrower, chain: walletClient.chain })); },
    }, borrower, agent, budget, expiry);
    setMessage("Repayment key authorized for 30 days. The cap is cumulative and does not reset automatically.");
  }

  return <section aria-label="Automatic repayment">
    <h2>Automatic repayment</h2>
    <p>Deposit a limited token budget. Your dedicated repayment key can only pay your ProofLine debt.</p>
    <label>Repayment key <input value={agentText} onChange={e => setAgentText(e.target.value)} disabled={busy} /></label>
    <label>30-day token budget <input inputMode="decimal" value={budgetText} onChange={e => setBudgetText(e.target.value)} disabled={busy} /></label>
    <button disabled={busy} onClick={() => void run(enable)}>Fund and enable / renew</button>
    <button disabled={busy} onClick={() => void run(async () => {
      await confirmed(await walletClient.writeContract({ address: vault, abi: vaultAbi, functionName: "revoke", args: [getAddress(agentText)], account: borrower, chain: walletClient.chain }));
      setMessage("This repayment key is revoked. Unused funds remain withdrawable.");
    })}>Revoke key</button>
    <button disabled={busy} onClick={() => void run(async () => {
      const amount = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "borrowerBalance", args: [borrower] });
      if (!amount) throw new Error("No unused budget to withdraw.");
      await checkWallet();
      await confirmed(await walletClient.writeContract({ address: vault, abi: vaultAbi, functionName: "withdrawUnusedBudget", args: [amount], account: borrower, chain: walletClient.chain }));
      setMessage("Unused budget withdrawn. Revoke keys separately if you no longer want them authorized.");
    })}>Withdraw unused budget</button>
    <p role="status">{message}</p>
  </section>;
}
