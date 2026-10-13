#!/usr/bin/env python3
"""Broadcast the manual demo to a disposable local chain, then verify mined state.

Uses Anvil's unlocked LOCAL account; no private keys, Reclaim credentials or testnet MON.
Only the subprocess started here is stopped. No existing chain is reset.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import time
from urllib.request import Request, urlopen

CONTRACTS = Path(__file__).resolve().parents[1]
PROJECT = CONTRACTS.parent
PORT = int(os.environ.get("PROOFLINE_LOCAL_PORT", "0"))
RPC = f"http://127.0.0.1:{PORT}"
ACTOR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"


def rpc(method, params):
    data = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    with urlopen(Request(RPC, data, {"Content-Type": "application/json"}), timeout=5) as response:
        result = json.load(response)
    if "error" in result:
        raise RuntimeError(result["error"])
    return result["result"]


def run(args, env):
    subprocess.run(args, cwd=CONTRACTS, env=env, check=True)


def call(contract, signature, *args):
    result = subprocess.check_output(
        ["cast", "call", contract, signature, *args, "--rpc-url", RPC],
        cwd=CONTRACTS, text=True,
    ).strip()
    return int(result.split()[0])


def transaction(sender, target, signature, *args):
    data = subprocess.check_output(["cast", "calldata", signature, *args], text=True).strip()
    tx_hash = rpc("eth_sendTransaction", [{"from": sender, "to": target, "data": data}])
    receipt = rpc("eth_getTransactionReceipt", [tx_hash])
    assert receipt is not None and int(receipt["status"], 16) == 1
    return receipt


def expect_revert(sender, target, signature, *args):
    data = subprocess.check_output(["cast", "calldata", signature, *args], text=True).strip()
    try:
        rpc("eth_call", [{"from": sender, "to": target, "data": data}, "latest"])
    except RuntimeError as error:
        assert "revert" in str(error).lower()
        return
    raise AssertionError("Expected an authorization revert")


def main():
    global PORT, RPC
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", PORT))
        PORT = sock.getsockname()[1]
    RPC = f"http://127.0.0.1:{PORT}"
    (PROJECT / ".local").mkdir(exist_ok=True)
    env = os.environ.copy()
    env.update({"DEPLOYER_ADDRESS": ACTOR, "ROOT_CONTROLLER_ADDRESS": ACTOR, "ORACLE_WRITER_ADDRESS": ACTOR})
    with (PROJECT / ".local/anvil.log").open("w") as log:
        chain = subprocess.Popen(
            ["anvil", "--host", "127.0.0.1", "--port", str(PORT), "--chain-id", "31337", "--silent"],
            cwd=CONTRACTS, stdout=log, stderr=log,
        )
        try:
            for _ in range(100):
                if chain.poll() is not None:
                    raise RuntimeError("Anvil exited; see .local/anvil.log")
                try:
                    if int(rpc("eth_chainId", []), 16) == 31337:
                        break
                except (OSError, RuntimeError):
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError("Local chain did not start")

            flags = ["--root", ".", "--rpc-url", RPC, "--sender", ACTOR, "--unlocked", "--broadcast", "--slow"]
            run(["forge", "script", "script/Deploy.s.sol:Deploy", *flags], env)
            deployed = json.loads((CONTRACTS / "broadcast/Deploy.s.sol/31337/run-latest.json").read_text())
            creates = [tx for tx in deployed["transactions"] if tx["transactionType"] == "CREATE"]
            assert [tx["contractName"] for tx in creates] == ["DemoToken", "DemoToken", "AttestationRegistry", "CreditLine", "RepaymentVault"]
            col, loan, registry, line, vault = [tx["contractAddress"] for tx in creates]
            env.update({"ATTESTATION_REGISTRY_ADDRESS": registry, "CREDIT_LINE_ADDRESS": line})
            run(["forge", "script", "script/ManualDemo.s.sol:ManualDemo", *flags], env)
            demo = json.loads((CONTRACTS / "broadcast/ManualDemo.s.sol/31337/run-latest.json").read_text())

            all_txs = deployed["transactions"] + demo["transactions"]
            receipts = [rpc("eth_getTransactionReceipt", [tx["hash"]]) for tx in all_txs]
            assert all(r is not None and int(r["status"], 16) == 1 for r in receipts), "unmined or failed transaction"
            assert all(rpc("eth_getCode", [address, "latest"]) != "0x" for address in (col, loan, registry, line, vault))
            assert call(line, "collateralOf(address)(uint256)", ACTOR) == 100_000_000
            assert call(line, "borrowedOf(address)(uint256)", ACTOR) == 80_000_000
            assert call(line, "maxBorrow(address)(uint256)", ACTOR) == 80_000_000
            assert call(loan, "balanceOf(address)(uint256)", ACTOR) == 80_000_000
            assert call(col, "balanceOf(address)(uint256)", line) == 100_000_000
            assert call(loan, "balanceOf(address)(uint256)", line) == 920_000_000
            extra = subprocess.run(
                ["cast", "call", line, "borrow(uint256)", "1", "--from", ACTOR, "--rpc-url", RPC],
                cwd=CONTRACTS, capture_output=True, text=True,
            )
            assert extra.returncode != 0 and "revert" in extra.stderr.lower(), "over-borrow should revert"
            next_writer = rpc("eth_accounts", [])[1]
            receipts.append(transaction(ACTOR, registry, "rotateOracle(address)", next_writer))
            expect_revert(ACTOR, registry, "revoke(address)", next_writer)
            receipts.append(transaction(next_writer, registry, "revoke(address)", next_writer))
            receipts.append(transaction(ACTOR, registry, "revokeOracle()"))
            expect_revert(next_writer, registry, "revoke(address)", next_writer)
            receipts.append(transaction(ACTOR, registry, "rotateOracle(address)", ACTOR))
            receipts.append(transaction(ACTOR, registry, "revoke(address)", next_writer))
            assert call(line, "borrowedOf(address)(uint256)", ACTOR) == 80_000_000
            rpc("evm_increaseTime", [7 * 24 * 60 * 60 + 1])
            rpc("evm_mine", [])
            assert call(line, "maxBorrow(address)(uint256)", ACTOR) == 50_000_000
            assert call(line, "borrowedOf(address)(uint256)", ACTOR) == 80_000_000
            assert call(line, "availableToBorrow(address)(uint256)", ACTOR) == 0
            agent = rpc("eth_accounts", [])[2]
            receipts.append(transaction(ACTOR, loan, "approve(address,uint256)", vault, "20000000"))
            receipts.append(transaction(ACTOR, vault, "depositBudget(uint256)", "20000000"))
            now = int(rpc("eth_getBlockByNumber", ["latest", False])["timestamp"], 16)
            receipts.append(transaction(ACTOR, vault, "delegate(address,uint256,uint64)", agent, "10000000", str(now + 30 * 86400)))
            receipts.append(transaction(agent, vault, "repayOnBehalf(uint256)", "10000000"))
            assert call(line, "borrowedOf(address)(uint256)", ACTOR) == 70_000_000
            assert call(vault, "borrowerBalance(address)(uint256)", ACTOR) == 10_000_000
            expect_revert(agent, vault, "repayOnBehalf(uint256)", "1")
            receipts.append(transaction(ACTOR, vault, "revoke(address)", agent))
            expect_revert(agent, vault, "repayOnBehalf(uint256)", "1")
            receipts.append(transaction(ACTOR, vault, "withdrawUnusedBudget(uint256)", "10000000"))
            assert call(vault, "totalBudgetBalance()(uint256)") == 0
            assert call(loan, "balanceOf(address)(uint256)", vault) == 0
            assert call(col, "balanceOf(address)(uint256)", line) == 100_000_000
            manifest = {
                "network": "disposable local Anvil; NOT Monad testnet", "chainId": 31337,
                "rpcRunningAfterScript": False, "borrower": ACTOR,
                "contracts": {"collateralToken": col, "loanToken": loan, "attestationRegistry": registry, "creditLine": line, "repaymentVault": vault},
                "receipts": [{"hash": r["transactionHash"], "block": int(r["blockNumber"], 16), "status": 1} for r in receipts],
                "verified": {"collateralUnits": 100, "baseLimit": 50, "boostedLimit": 80,
                    "borrowedUnits": 80, "overBorrowReverted": True, "collateralUntouchedByBorrow": True,
                    "oracleRotationRevocationRecovery": True,
                    "expiryReturnsLimitTo50": True, "expiryPreserves80Debt": True, "delegatedRepayment": 10, "finalDebt": 70, "repaymentCapAndRevocation": True},
            }
            (PROJECT / "deployments/local.json").write_text(json.dumps(manifest, indent=2) + "\n")
            print("PASS: mined local demo, 50 -> 80 limit, token transfers, over-borrow rejection, expiry and persistent debt.")
            print("Saved deployments/local.json. No Monad testnet deployment was performed.")
        finally:
            chain.terminate()
            try:
                chain.wait(timeout=5)
            except subprocess.TimeoutExpired:
                chain.kill()
                chain.wait()


if __name__ == "__main__":
    main()
