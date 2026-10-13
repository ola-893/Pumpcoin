import { parseAbi } from "viem";

export const mandateAbi = parseAbi([
  "function creditLine() view returns (address)",
  "function loanToken() view returns (address)",
  "function mandateOwner(address) view returns (address)",
  "function mandates(address) view returns (uint256 drawCapWei,uint256 drawnWei,uint64 expiresAt,bool revoked)",
  "function mandateVersion(address) view returns (uint256)",
  "function enrollmentNonce(address) view returns (uint256)",
  "function enrollmentMessage(address,address,uint256,uint64) view returns (bytes32)",
  "function grantMandate(address,uint256,uint64,uint256,uint64,bytes)",
  "function revokeMandate(address)",
  "function agentBorrow(uint256)",
  "function agentRepay(uint256)",
  "event AgentBorrowed(address indexed agentKey,uint256 amount)",
  "event AgentRepaid(address indexed agentKey,uint256 amount)",
]);
export const lineAbi = parseAbi([
  "function registry() view returns (address)",
  "function loanToken() view returns (address)",
  "function agentCreditMandate() view returns (address)",
  "function borrowedOf(address) view returns (uint256)",
  "function availableToBorrow(address) view returns (uint256)",
  "event Borrowed(address indexed borrower,uint256 amount)",
  "event BorrowedFor(address indexed caller,address indexed human,uint256 amount)",
  "event Repaid(address indexed borrower,uint256 amount)",
  "event RepaidFor(address indexed payer,address indexed borrower,uint256 amount)",
  "event PositionMigrated(address indexed previous,address indexed next,uint256 collateral,uint256 debt)",
]);
export const tokenAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);
export const registryAbi = parseAbi([
  "function evidenceMode() view returns (bool)",
  "function positionController() view returns (address)",
]);
