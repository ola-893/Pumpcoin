// Pure integer calculations over real contract reads. There is no continuous score,
// interest schedule, NFT or streaming repayment model in the deployed contracts.
export function requiredCollateral(debt: bigint, ltvBps: bigint): bigint {
  if (ltvBps <= 0n) throw new Error('LTV unavailable');
  return (debt * 10_000n + ltvBps - 1n) / ltvBps;
}
export function withdrawableCollateral(collateral: bigint, debt: bigint, ltvBps: bigint): bigint {
  const needed = requiredCollateral(debt, ltvBps);
  return collateral > needed ? collateral - needed : 0n;
}
