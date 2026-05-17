export type ActionType = "HOLD" | "REBALANCE" | "YIELD_HARVEST" | "FX_HEDGE" | "DEPOSIT" | "WITHDRAW";

export interface DecisionLogEntry {
  id: number;
  timestamp: number;
  action: ActionType;
  confidence: number;
  ipfsHash: string;
  summary: string;
  beforeAlloc: { usdc: number; eurc: number; usyc: number };
  afterAlloc: { usdc: number; eurc: number; usyc: number };
}

export interface AllocationBands {
  usdcMin: number;
  usdcMax: number;
  eurcMin: number;
  eurcMax: number;
  usycMin: number;
  usycMax: number;
}

export interface VaultState {
  totalAum: number;
  usdcBalance: number;
  eurcBalance: number;
  eurcValueUsd: number;
  usycShares: number;
  usycValueUsd: number;
  yieldAccrued: number;
  netGain: number;
  agentActive: boolean;
  lastDecisionTime: number;
  nextCycleTime: number;
}

export interface MarketSnapshot {
  eurUsd: number;
  usycNav: number;
  usycApy: number;
  timestamp: number;
}

export interface Allocation {
  name: string;
  value: number;
  color: string;
  percent: number;
}

/**
 * Maps directly to the on-chain DecisionLog struct in DrachmaVault.sol.
 * All basis-point fields are uint16 (0-10000) and timestamp is uint48.
 * reasoningCID is the bytes32 sha256 hash of the IPFS CID string.
 */
export interface ContractDecisionLog {
  timestamp: number;        // uint48 — unix seconds
  action: number;           // uint8  — 0=rebalance, 1=sweep_yield, 2=emergency_exit
  usdcBpsBefore: number;    // uint16 — USDC allocation before rebalance (bps)
  eurcBpsBefore: number;    // uint16 — EURC allocation before rebalance (bps)
  usycBpsBefore: number;    // uint16 — USYC allocation before rebalance (bps)
  usdcBpsAfter: number;     // uint16 — USDC allocation after rebalance (bps)
  eurcBpsAfter: number;     // uint16 — EURC allocation after rebalance (bps)
  usycBpsAfter: number;     // uint16 — USYC allocation after rebalance (bps)
  reasoningCID: string;     // bytes32 — sha256(IPFS CID) of full LLM reasoning trace
}

/** Action types as defined in the DrachmaVault.sol contract */
export type ContractActionType = 0 | 1 | 2;

/** Human-readable labels for contract action codes */
export const CONTRACT_ACTION_LABELS: Record<ContractActionType, string> = {
  0: "Rebalance",
  1: "Sweep Yield",
  2: "Emergency Exit",
} as const;
