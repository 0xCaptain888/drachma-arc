"use client";

import { AumCard } from "@/components/AumCard";
import { AllocationChart } from "@/components/AllocationChart";
import { YieldCard } from "@/components/YieldCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DecisionLogTable } from "@/components/DecisionLogTable";
import { mockVault, mockDecisionLog, mockMarket } from "@/lib/mockData";
import { formatUSD, timeAgo } from "@/lib/format";
import { COLORS } from "@/lib/constants";
import { Allocation } from "@/lib/types";

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
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold tracking-tight">DRACHMA</h1>
        <p className="text-sm text-gray-400">
          Autonomous Stablecoin Reserve Manager on Arc
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

      {/* Decision log */}
      <DecisionLogTable entries={mockDecisionLog} compact />
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
