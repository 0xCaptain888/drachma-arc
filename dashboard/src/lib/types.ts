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
  triggerType: number;      // uint8  — 0=scheduled, 1=consensus, 2=urgent, 3=conversation
  networkSignalValue: number; // int32 — consensus signal value in bps
}

/** Action types as defined in the DrachmaVault.sol contract */
export type ContractActionType = 0 | 1 | 2;

/** Human-readable labels for contract action codes */
export const CONTRACT_ACTION_LABELS: Record<ContractActionType, string> = {
  0: "Rebalance",
  1: "Sweep Yield",
  2: "Emergency Exit",
} as const;

// ─── Signal Bus ──────────────────────────────────────────────────────────────

/** A single signal submitted by one vault agent to the Signal Bus */
export interface Signal {
  vault: string;      // address — submitting vault
  agent: string;      // address — agent that produced the signal
  signalType: number; // uint8   — 0-5, see SIGNAL_TYPE_LABELS
  value: number;      // int32   — signal value (e.g. bps spread)
  timestamp: number;  // uint48  — unix seconds
  vaultScore: number; // uint16  — DrachmaScore of the submitting vault at time of signal
}

/** A ConsensusReached event aggregated across participating vaults */
export interface ConsensusEvent {
  signalType: number;          // uint8
  weightedAvgValue: number;    // int32 — weighted average across contributing vaults
  vaultCount: number;          // uint256 — number of vaults that contributed
  contributingVaults: string[]; // address[]
  timestamp: number;           // uint48
}

// ─── DrachmaScore ────────────────────────────────────────────────────────────

/** The four sub-components that make up a vault's DrachmaScore */
export interface ScoreBreakdown {
  yieldPerformance: number; // uint16, max 300
  bandDiscipline: number;   // uint16, max 250
  riskResponse: number;     // uint16, max 250
  consistency: number;      // uint16, max 200
}

/** A vault's full score record for the leaderboard */
export interface ScoreRecord {
  rank: number;
  vault: string;          // address
  score: number;          // uint16, max 1000
  creditLane: boolean;    // eligible for credit lane?
  lastUpdate: number;     // uint48 — unix seconds
  breakdown: ScoreBreakdown;
  ipfsCid?: string;       // optional IPFS evidence link
}

// ─── dUSDC ───────────────────────────────────────────────────────────────────

/** NAV data point for the dUSDC chart */
export interface NavDataPoint {
  date: string;   // ISO date string label
  nav: number;    // NAV per share, e.g. 1.000842
}

/** dUSDC token state */
export interface DusdcState {
  navPerShare: number;
  totalSupply: number;
  history: NavDataPoint[];
}
