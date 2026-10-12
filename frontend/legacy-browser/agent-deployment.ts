import { getAddress, isAddress, type Address } from "viem";

export type AgentDeployment = {
  chainId: 10143;
  mode: "evidence";
  fromBlock: bigint;
  creditLine: Address;
  loanToken: Address;
  collateralToken: Address;
  registry: Address;
  mandate: Address;
};

export function parseAgentDeployment(
  value: string | undefined,
): AgentDeployment | null {
  if (!value) return null;
  const x = JSON.parse(value) as Record<string, unknown>;
  if (
    x.chainId !== 10143 ||
    x.mode !== "evidence" ||
    !/^\d+$/.test(String(x.fromBlock))
  )
    throw new Error("Invalid agent deployment chain/mode/block");
  const address = (name: string) => {
    const v = String(x[name]);
    if (!isAddress(v) || /^0x0{40}$/i.test(v))
      throw new Error(`Invalid ${name}`);
    return getAddress(v);
  };
  const d = {
    chainId: 10143 as const,
    mode: "evidence" as const,
    fromBlock: BigInt(String(x.fromBlock)),
    creditLine: address("creditLine"),
    loanToken: address("loanToken"),
    collateralToken: address("collateralToken"),
    registry: address("registry"),
    mandate: address("mandate"),
  };
  if (
    new Set(
      [d.creditLine, d.loanToken, d.collateralToken, d.registry, d.mandate].map(
        (a) => a.toLowerCase(),
      ),
    ).size !== 5
  )
    throw new Error("Deployment addresses must be distinct");
  return d;
}
