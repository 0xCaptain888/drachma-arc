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

// ─── Signal Bus ──────────────────────────────────────────────────────────────

export const SIGNAL_BUS_ADDRESS =
  process.env.NEXT_PUBLIC_SIGNAL_BUS_ADDRESS || "0x0000000000000000000000000000000000000000";

export const SCORE_ORACLE_ADDRESS =
  process.env.NEXT_PUBLIC_SCORE_ORACLE_ADDRESS || "0x0000000000000000000000000000000000000000";

export const FACTORY_ADDRESS =
  process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "0x0000000000000000000000000000000000000000";

export const SIGNAL_BUS_ABI = [
  // read functions
  {
    name: "totalSignals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalConsensusEvents",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "registeredVaultCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getConsensusHistory",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "signalType", type: "uint8" },
          { name: "weightedAvgValue", type: "int32" },
          { name: "vaultCount", type: "uint256" },
          { name: "contributingVaults", type: "address[]" },
          { name: "timestamp", type: "uint48" },
        ],
      },
    ],
  },
  {
    name: "getRecentSignals",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "signalType", type: "uint8" },
      { name: "windowSecs", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "vault", type: "address" },
          { name: "agent", type: "address" },
          { name: "signalType", type: "uint8" },
          { name: "value", type: "int32" },
          { name: "timestamp", type: "uint48" },
          { name: "vaultScore", type: "uint16" },
        ],
      },
    ],
  },
] as const;

// ─── Score Oracle ─────────────────────────────────────────────────────────────

export const SCORE_ORACLE_ABI = [
  {
    name: "getScore",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    name: "isCreditLaneEligible",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getScoreBreakdown",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [
      { name: "total", type: "uint16" },
      {
        name: "latest",
        type: "tuple",
        components: [
          { name: "yieldPerformance", type: "uint16" },
          { name: "bandDiscipline", type: "uint16" },
          { name: "riskResponse", type: "uint16" },
          { name: "consistency", type: "uint16" },
        ],
      },
    ],
  },
  {
    name: "getScoreForDisplay",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [
      { name: "score", type: "uint16" },
      { name: "creditLane", type: "bool" },
      { name: "lastUpdate", type: "uint48" },
      { name: "historyLength", type: "uint256" },
    ],
  },
] as const;

// ─── Signal metadata ──────────────────────────────────────────────────────────

export const SIGNAL_TYPE_LABELS: Record<number, string> = {
  0: "EURC Spread",
  1: "USYC NAV",
  2: "StableFX Thin",
  3: "Depeg Critical",
  4: "Macro Alert",
  5: "Yield Spike",
};

export const SIGNAL_TYPE_COLORS: Record<number, string> = {
  0: "#F59E0B",
  1: "#3B82F6",
  2: "#8B5CF6",
  3: "#EF4444",
  4: "#10B981",
  5: "#F97316",
};
