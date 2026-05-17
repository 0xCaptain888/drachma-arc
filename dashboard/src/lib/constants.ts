export const COLORS = {
  usdc: "#1A56DB",
  eurc: "#0E9F6E",
  usyc: "#B45309",
} as const;

export const TOKEN_NAMES: Record<string, string> = {
  usdc: "USDC",
  eurc: "EURC",
  usyc: "USYC",
};

export const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export const VAULT_ADDRESS = "0x0000000000000000000000000000000000000001" as const;

export const VAULT_ABI = [
  {
    name: "totalAum",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "decisionLogLength",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "log",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      { name: "timestamp", type: "uint256" },
      { name: "action", type: "uint8" },
      { name: "ipfsHash", type: "string" },
      { name: "confidence", type: "uint256" },
    ],
  },
  {
    name: "bands",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "usdcMin", type: "uint256" },
      { name: "usdcMax", type: "uint256" },
      { name: "eurcMin", type: "uint256" },
      { name: "eurcMax", type: "uint256" },
      { name: "usycMin", type: "uint256" },
      { name: "usycMax", type: "uint256" },
    ],
  },
] as const;
