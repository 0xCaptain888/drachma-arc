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

export const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";

export const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_ADDRESS ||
  "0x0000000000000000000000000000000000000001") as `0x${string}`;

export const ARC_RPC =
  process.env.NEXT_PUBLIC_ARC_RPC || "https://rpc.arc.drachma.local";

export const VAULT_ABI = [
  // --- View functions ---
  {
    name: "totalAum",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decisionLogLength",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "agent",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "agentVersion",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // --- Write functions ---
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "updateBands",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "usdcMin", type: "uint256" },
      { name: "usdcMax", type: "uint256" },
      { name: "eurcMin", type: "uint256" },
      { name: "eurcMax", type: "uint256" },
      { name: "usycMin", type: "uint256" },
      { name: "usycMax", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "rotateAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "newAgent", type: "address" },
      { name: "newVersion", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "rebalance",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "action", type: "uint8" },
      { name: "ipfsHash", type: "string" },
      { name: "confidence", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "emergencyExit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  // --- Events ---
  {
    name: "Rebalanced",
    type: "event",
    inputs: [
      { name: "timestamp", type: "uint256", indexed: false },
      { name: "action", type: "uint8", indexed: false },
      { name: "ipfsHash", type: "string", indexed: false },
      { name: "confidence", type: "uint256", indexed: false },
    ],
  },
  {
    name: "Deposited",
    type: "event",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "Withdrawn",
    type: "event",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "AgentRotated",
    type: "event",
    inputs: [
      { name: "oldAgent", type: "address", indexed: true },
      { name: "newAgent", type: "address", indexed: true },
      { name: "newVersion", type: "uint256", indexed: false },
    ],
  },
  {
    name: "EmergencyExit",
    type: "event",
    inputs: [
      { name: "timestamp", type: "uint256", indexed: false },
      { name: "triggeredBy", type: "address", indexed: true },
    ],
  },
] as const;
