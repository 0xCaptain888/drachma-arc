"use client";

import { AumCard } from "@/components/AumCard";
import { AllocationChart } from "@/components/AllocationChart";
import { YieldCard } from "@/components/YieldCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DecisionLogTable } from "@/components/DecisionLogTable";
import { NetworkTicker } from "@/components/NetworkTicker";
import { NavChart } from "@/components/NavChart";
import { mockVault, mockDecisionLog, mockMarket } from "@/lib/mockData";
import { formatUSD, timeAgo } from "@/lib/format";
import { COLORS } from "@/lib/constants";
import { Allocation, Signal, NavDataPoint } from "@/lib/types";

// ─── Mock data for new sections ───────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000);
const MIN = 60;

const mockTickerSignals: Signal[] = [
  { vault: "0x7f3a4b2c1d8e9f0a3b4c5d6e7f8a9b0c1d2e3f4a", agent: "0xaaaa", signalType: 0, value: 38,    timestamp: NOW - 2 * MIN,  vaultScore: 872 },
  { vault: "0x2b8d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d", agent: "0xbbbb", signalType: 1, value: 10028, timestamp: NOW - 7 * MIN,  vaultScore: 791 },
  { vault: "0x9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f", agent: "0xcccc", signalType: 5, value: 22,    timestamp: NOW - 15 * MIN, vaultScore: 910 },
  { vault: "0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0", agent: "0xdddd", signalType: 4, value: 1,     timestamp: NOW - 23 * MIN, vaultScore: 834 },
  { vault: "0xc4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3", agent: "0xeeee", signalType: 0, value: 41,    timestamp: NOW - 31 * MIN, vaultScore: 658 },
];

// dUSDC: 7-day NAV history, gradual increase from 1.000000 → 1.000842
const DAY_MS = 86400 * 1000;
const mockNavHistory: NavDataPoint[] = Array.from({ length: 8 }, (_, i) => {
  const d = new Date(Date.now() - (7 - i) * DAY_MS);
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  // Gentle compound curve
  const nav = 1 + (0.000842 * i) / 7 + Math.sin(i * 0.8) * 0.000012;
  return { date: label, nav: parseFloat(nav.toFixed(6)) };
});

const mockDusdcTotalSupply = 4_182_300;

export default function DashboardPage() {
  const vault = mockVault;
  const market = mockMarket;

  const allocations: Allocation[] = [
    { name: "USDC", value: vault.usdcBalance, color: COLORS.usdc, percent: 35.0 },
    { name: "EURC", value: vault.eurcValueUsd, color: COLORS.eurc, percent: 24.8 },
    { name: "USYC", value: vault.usycValueUsd, color: COLORS.usyc, percent: 40.2 },
  ];

  return (
    <div className="space-y-6">
      {/* Network Activity Ticker */}
      <NetworkTicker signals={mockTickerSignals} />

      {/* Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold tracking-tight">Drachma Network</h1>
        <p className="text-sm text-gray-400">
          AI Agents Collectively Managing Stablecoin Reserves
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {mockTickerSignals.length} vaults. One network. Every agent makes all agents smarter.
        </p>
      </div>

      {/* Top row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AumCard
          totalAum={vault.totalAum}
          usdcBalance={vault.usdcBalance}
          eurcBalance={vault.eurcBalance}
          eurcValueUsd={vault.eurcValueUsd}
          usycShares={vault.usycShares}
          usycValueUsd={vault.usycValueUsd}
        />
        <AllocationChart data={allocations} />
        <div className="flex flex-col gap-4">
          <YieldCard yieldAccrued={vault.yieldAccrued} usycApy={market.usycApy} />
          <DusdcHoldingsCard />
          <NetGainCard gain={vault.netGain} />
          <StatusBadge
            active={vault.agentActive}
            lastDecision={timeAgo(vault.lastDecisionTime)}
            nextCycle={timeAgo(vault.nextCycleTime).replace("ago", "from now")}
          />
        </div>
      </div>

      {/* Market data bar */}
      <div className="flex flex-wrap gap-6 rounded-xl border border-dark-border bg-dark-card px-5 py-3 text-sm">
        <Stat label="EUR/USD" value={market.eurUsd.toFixed(4)} />
        <Stat label="USYC NAV" value={`$${market.usycNav.toFixed(4)}`} />
        <Stat label="USYC APY" value={`${market.usycApy}%`} />
        <Stat label="Decisions" value={mockDecisionLog.length.toString()} />
      </div>

      {/* dUSDC section */}
      <div className="rounded-xl border border-dark-border bg-dark-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400">
              dUSDC — Vault Share Token
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              1 dUSDC represents a pro-rata share of the managed reserve pool
            </p>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-500">NAV/share: </span>
              <span className="font-mono font-semibold text-white">
                ${mockNavHistory[mockNavHistory.length - 1].nav.toFixed(6)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Supply: </span>
              <span className="font-medium text-gray-200">
                {mockDusdcTotalSupply.toLocaleString("en-US")} dUSDC
              </span>
            </div>
          </div>
        </div>
        <NavChart data={mockNavHistory} />
      </div>

      {/* Decision log */}
      <DecisionLogTable entries={mockDecisionLog} compact />
    </div>
  );
}

function DusdcHoldingsCard() {
  const balance = 1000.842;
  const navPerShare = 1.000842;
  const usdValue = 1000.84;
  const yieldEarned = usdValue - 1000;

  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-400">
        dUSDC Holdings
      </h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-gray-400">Balance</span>
          <p className="font-mono font-semibold text-white">{balance.toFixed(6)}</p>
        </div>
        <div>
          <span className="text-gray-400">NAV/share</span>
          <p className="font-mono font-semibold text-white">{navPerShare.toFixed(6)}</p>
        </div>
        <div>
          <span className="text-gray-400">USD Value</span>
          <p className="font-mono font-semibold text-white">${usdValue.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-gray-400">Yield earned</span>
          <p className="font-mono font-semibold text-emerald-400">+${yieldEarned.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}

function NetGainCard({ gain }: { gain: number }) {
  const positive = gain >= 0;
  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      <h3 className="mb-1 text-sm font-medium uppercase tracking-wider text-gray-400">
        Net Gain vs Hold
      </h3>
      <p className={`text-2xl font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}>
        {positive ? "+" : ""}{formatUSD(gain)}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="font-medium text-gray-200">{value}</span>
    </div>
  );
}
