import { DecisionLogEntry, VaultState, MarketSnapshot, ActionType } from "./types";

const NOW = Math.floor(Date.now() / 1000);
const HOUR = 3600;
const DAY = 86400;

export const mockMarket: MarketSnapshot = {
  eurUsd: 1.0811,
  usycNav: 1.0028,
  usycApy: 4.5,
  timestamp: NOW - 120,
};

export const mockVault: VaultState = {
  totalAum: 1008.43,
  usdcBalance: 352.95,
  eurcBalance: 231.48,
  eurcValueUsd: 250.24,
  usycShares: 404.12,
  usycValueUsd: 405.24,
  yieldAccrued: 2.18,
  netGain: 3.41,
  agentActive: true,
  lastDecisionTime: NOW - HOUR * 2,
  nextCycleTime: NOW + HOUR * 4,
};

const actions: ActionType[] = [
  "REBALANCE", "HOLD", "YIELD_HARVEST", "FX_HEDGE",
  "HOLD", "REBALANCE", "HOLD", "HOLD",
];

const summaries: Record<ActionType, string[]> = {
  HOLD: ["Allocations within bands, no action needed", "Market stable, maintaining positions"],
  REBALANCE: ["EURC overweight, rotating to USYC", "Rebalancing to target allocation"],
  YIELD_HARVEST: ["Harvesting USYC yield to USDC", "Compounding yield into reserves"],
  FX_HEDGE: ["EUR/USD vol spike, increasing EURC hedge", "Adjusting FX exposure"],
  DEPOSIT: ["Owner deposited USDC"],
  WITHDRAW: ["Owner withdrew USDC"],
};

export const mockDecisionLog: DecisionLogEntry[] = Array.from({ length: 28 }, (_, i) => {
  const action = actions[i % actions.length];
  const msgs = summaries[action];
  return {
    id: 28 - i,
    timestamp: NOW - i * HOUR * 6,
    action,
    confidence: 70 + Math.floor(Math.random() * 25),
    ipfsHash: `Qm${Array.from({ length: 44 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("")}`,
    summary: msgs[i % msgs.length],
    beforeAlloc: {
      usdc: 30 + Math.random() * 10,
      eurc: 20 + Math.random() * 10,
      usyc: 35 + Math.random() * 10,
    },
    afterAlloc: { usdc: 35.0, eurc: 24.8, usyc: 40.2 },
  };
});
