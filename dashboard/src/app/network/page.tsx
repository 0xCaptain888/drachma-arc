"use client";

import { Signal, ConsensusEvent } from "@/lib/types";
import { SIGNAL_TYPE_LABELS, SIGNAL_TYPE_COLORS } from "@/lib/constants";
import { formatAddress, timeAgo } from "@/lib/format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ─── Mock data ────────────────────────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000);
const MIN = 60;

const MOCK_VAULTS = [
  "0x7f3a4b2c1d8e9f0a3b4c5d6e7f8a9b0c1d2e3f4a",
  "0x2b8d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d",
  "0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
  "0xc4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3",
  "0x9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f",
];

const mockSignals: Signal[] = [
  { vault: MOCK_VAULTS[0], agent: MOCK_VAULTS[1], signalType: 0, value: 38,     timestamp: NOW - 2 * MIN,  vaultScore: 872 },
  { vault: MOCK_VAULTS[2], agent: MOCK_VAULTS[3], signalType: 1, value: 10028,  timestamp: NOW - 5 * MIN,  vaultScore: 791 },
  { vault: MOCK_VAULTS[1], agent: MOCK_VAULTS[4], signalType: 4, value: 1,      timestamp: NOW - 9 * MIN,  vaultScore: 834 },
  { vault: MOCK_VAULTS[3], agent: MOCK_VAULTS[0], signalType: 0, value: 41,     timestamp: NOW - 13 * MIN, vaultScore: 658 },
  { vault: MOCK_VAULTS[4], agent: MOCK_VAULTS[2], signalType: 5, value: 22,     timestamp: NOW - 18 * MIN, vaultScore: 910 },
  { vault: MOCK_VAULTS[0], agent: MOCK_VAULTS[1], signalType: 2, value: -3,     timestamp: NOW - 24 * MIN, vaultScore: 872 },
  { vault: MOCK_VAULTS[2], agent: MOCK_VAULTS[3], signalType: 1, value: 10031,  timestamp: NOW - 31 * MIN, vaultScore: 791 },
  { vault: MOCK_VAULTS[1], agent: MOCK_VAULTS[4], signalType: 0, value: 35,     timestamp: NOW - 39 * MIN, vaultScore: 834 },
  { vault: MOCK_VAULTS[3], agent: MOCK_VAULTS[0], signalType: 4, value: -1,     timestamp: NOW - 47 * MIN, vaultScore: 658 },
  { vault: MOCK_VAULTS[4], agent: MOCK_VAULTS[2], signalType: 3, value: 7,      timestamp: NOW - 55 * MIN, vaultScore: 910 },
  { vault: MOCK_VAULTS[0], agent: MOCK_VAULTS[1], signalType: 5, value: 18,     timestamp: NOW - 63 * MIN, vaultScore: 872 },
  { vault: MOCK_VAULTS[2], agent: MOCK_VAULTS[3], signalType: 0, value: 29,     timestamp: NOW - 72 * MIN, vaultScore: 791 },
];

const mockConsensusHistory: ConsensusEvent[] = [
  {
    signalType: 0,
    weightedAvgValue: 39,
    vaultCount: 4,
    contributingVaults: MOCK_VAULTS.slice(0, 4),
    timestamp: NOW - 8 * MIN,
  },
  {
    signalType: 1,
    weightedAvgValue: 10029,
    vaultCount: 3,
    contributingVaults: MOCK_VAULTS.slice(1, 4),
    timestamp: NOW - 22 * MIN,
  },
  {
    signalType: 4,
    weightedAvgValue: 0,
    vaultCount: 5,
    contributingVaults: MOCK_VAULTS,
    timestamp: NOW - 41 * MIN,
  },
  {
    signalType: 5,
    weightedAvgValue: 20,
    vaultCount: 3,
    contributingVaults: [MOCK_VAULTS[0], MOCK_VAULTS[2], MOCK_VAULTS[4]],
    timestamp: NOW - 66 * MIN,
  },
  {
    signalType: 0,
    weightedAvgValue: 32,
    vaultCount: 4,
    contributingVaults: MOCK_VAULTS.slice(0, 4),
    timestamp: NOW - 103 * MIN,
  },
];

// Signal type distribution counts
const signalDistribution = Object.entries(SIGNAL_TYPE_LABELS).map(([key, label]) => {
  const type = Number(key);
  return {
    label,
    type,
    count: mockSignals.filter((s) => s.signalType === type).length,
    color: SIGNAL_TYPE_COLORS[type],
  };
}).filter((d) => d.count > 0);

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      <p className="mb-1 text-sm font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function formatSignalValue(type: number, value: number): string {
  if (type === 0) return `${value}bps`;
  if (type === 1) return `$${(value / 10000).toFixed(4)}`;
  if (type === 5) return `+${value}bps APY`;
  return `${value > 0 ? "+" : ""}${value}`;
}

function SignalRow({ signal }: { signal: Signal }) {
  const label = SIGNAL_TYPE_LABELS[signal.signalType] ?? `Type ${signal.signalType}`;
  const color = SIGNAL_TYPE_COLORS[signal.signalType] ?? "#9CA3AF";
  return (
    <div className="flex items-center gap-3 border-b border-dark-border/50 py-2.5 last:border-0">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span
        className="w-28 shrink-0 text-xs font-medium"
        style={{ color }}
      >
        {label}
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-sm text-white">
        {formatSignalValue(signal.signalType, signal.value)}
      </span>
      <span className="flex-1 font-mono text-xs text-gray-400">
        {formatAddress(signal.vault)}
      </span>
      <span className="shrink-0 text-xs text-gray-500">{timeAgo(signal.timestamp)}</span>
      <span className="w-16 shrink-0 text-right text-xs text-gray-500">
        Score: <span className="text-gray-300">{signal.vaultScore}</span>
      </span>
    </div>
  );
}

function ConsensusRow({ event }: { event: ConsensusEvent }) {
  const label = SIGNAL_TYPE_LABELS[event.signalType] ?? `Type ${event.signalType}`;
  const color = SIGNAL_TYPE_COLORS[event.signalType] ?? "#9CA3AF";
  return (
    <div className="flex items-center gap-3 border-b border-dark-border/50 py-2.5 last:border-0">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="w-28 shrink-0 text-xs font-medium" style={{ color }}>
        {label}
      </span>
      <span className="w-20 shrink-0 text-right font-mono text-sm text-white">
        {formatSignalValue(event.signalType, event.weightedAvgValue)}
      </span>
      <span className="flex-1 text-xs text-gray-400">
        {event.vaultCount} vault{event.vaultCount !== 1 ? "s" : ""} agreed
      </span>
      <span className="shrink-0 text-xs text-gray-500">{timeAgo(event.timestamp)}</span>
    </div>
  );
}

const tooltipStyle = {
  background: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "12px",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NetworkPage() {
  const totalSignalsToday = mockSignals.length + 34; // mock: signals this session + historical
  const consensusCount = mockConsensusHistory.length + 11;
  const registeredVaults = MOCK_VAULTS.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold tracking-tight">Drachma Network</h1>
        <p className="mt-1 text-sm text-gray-400">
          {registeredVaults} vaults. One network. Every agent makes all agents smarter.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          When multiple Drachma vaults independently detect the same market anomaly, a ConsensusReached event fires on Arc — and all agents respond within 30 seconds. No single point of failure. No single point of data.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Registered Vaults"
          value={registeredVaults.toString()}
          sub="Active on Signal Bus"
        />
        <StatCard
          label="Total Signals Today"
          value={totalSignalsToday.toString()}
          sub="Across all signal types"
        />
        <StatCard
          label="Consensus Events"
          value={consensusCount.toString()}
          sub="ConsensusReached since genesis"
        />
      </div>

      {/* Signal feed + Consensus history */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Live signal feed */}
        <div className="rounded-xl border border-dark-border bg-dark-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400">
              Live Signal Feed
            </h3>
          </div>
          <div className="max-h-80 overflow-y-auto pr-1">
            {mockSignals.map((signal, i) => (
              <SignalRow key={`${signal.vault}-${signal.timestamp}-${i}`} signal={signal} />
            ))}
          </div>
        </div>

        {/* Consensus history */}
        <div className="rounded-xl border border-dark-border bg-dark-card p-5">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
            Consensus History
          </h3>
          <div className="max-h-80 overflow-y-auto pr-1">
            {mockConsensusHistory.map((event, i) => (
              <ConsensusRow key={`${event.signalType}-${event.timestamp}-${i}`} event={event} />
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-600">
            ConsensusReached events are emitted when a quorum of vaults submit aligned signals
            within a rolling window.
          </p>
        </div>
      </div>

      {/* Signal type distribution */}
      <div className="rounded-xl border border-dark-border bg-dark-card p-5">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
          Signal Distribution (Today)
        </h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={signalDistribution}
              margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#6B7280", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => [v, "signals"]}
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {signalDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Footer note */}
      <p className="text-center text-xs text-gray-600">
        Signal Bus contract:{" "}
        <span className="font-mono">0x0000000000000000000000000000000000000000</span>
        {" — "}
        data refreshes every 30s in production
      </p>
    </div>
  );
}
