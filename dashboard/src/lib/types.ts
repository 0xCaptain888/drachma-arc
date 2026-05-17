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
