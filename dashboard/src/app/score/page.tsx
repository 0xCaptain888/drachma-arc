"use client";

import { useState } from "react";
import { ScoreRecord } from "@/lib/types";
import { formatAddress, timeAgo } from "@/lib/format";
import { IPFS_GATEWAY } from "@/lib/constants";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// ─── Mock data ────────────────────────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000);
const HOUR = 3600;

const mockLeaderboard: ScoreRecord[] = [
  {
    rank: 1,
    vault: "0x9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f",
    score: 910,
    creditLane: true,
    lastUpdate: NOW - HOUR * 1,
    breakdown: { yieldPerformance: 284, bandDiscipline: 238, riskResponse: 241, consistency: 147 },
    ipfsCid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
  },
  {
    rank: 2,
    vault: "0x7f3a4b2c1d8e9f0a3b4c5d6e7f8a9b0c1d2e3f4a",
    score: 872,
    creditLane: true,
    lastUpdate: NOW - HOUR * 2,
    breakdown: { yieldPerformance: 271, bandDiscipline: 229, riskResponse: 224, consistency: 148 },
    ipfsCid: "QmRCXNjqTubBSbwxVoSRY3EkgBz3u5Sk2GZ9kfYKuA9sMp",
  },
  {
    rank: 3,
    vault: "0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    score: 834,
    creditLane: true,
    lastUpdate: NOW - HOUR * 3,
    breakdown: { yieldPerformance: 258, bandDiscipline: 212, riskResponse: 218, consistency: 146 },
    ipfsCid: "QmNLei78zWmzUdbeRB3CiUfAizWUrbeeZh5K1rhAQKCh51",
  },
  {
    rank: 4,
    vault: "0x2b8d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d",
    score: 791,
    creditLane: false,
    lastUpdate: NOW - HOUR * 5,
    breakdown: { yieldPerformance: 241, bandDiscipline: 197, riskResponse: 205, consistency: 148 },
    ipfsCid: "QmT4AeWE9Q2g2K5R7VcMjTkHUwXp6ZrDiS3CnNKaBxPqW8",
  },
  {
    rank: 5,
    vault: "0xc4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3",
    score: 658,
    creditLane: false,
    lastUpdate: NOW - HOUR * 8,
    breakdown: { yieldPerformance: 198, bandDiscipline: 162, riskResponse: 171, consistency: 127 },
    ipfsCid: undefined,
  },
];

// ─── Score helpers ────────────────────────────────────────────────────────────

/** Map a score 0–1000 to a Tailwind colour class */
function scoreColor(score: number): string {
  if (score >= 850) return "text-emerald-400";
  if (score >= 700) return "text-blue-400";
  if (score >= 550) return "text-amber-400";
  return "text-red-400";
}

/** Map score to a background used in the score pill */
function scoreBg(score: number): string {
  if (score >= 850) return "bg-emerald-400/10 text-emerald-400";
  if (score >= 700) return "bg-blue-400/10 text-blue-400";
  if (score >= 550) return "bg-amber-400/10 text-amber-400";
  return "bg-red-400/10 text-red-400";
}

// ─── Radar chart data builder ─────────────────────────────────────────────────

function buildRadarData(record: ScoreRecord) {
  const { breakdown } = record;
  return [
    { axis: "Yield Perf.", value: (breakdown.yieldPerformance / 300) * 100, max: 300, raw: breakdown.yieldPerformance },
    { axis: "Band Disc.", value: (breakdown.bandDiscipline / 250) * 100, max: 250, raw: breakdown.bandDiscipline },
    { axis: "Risk Resp.", value: (breakdown.riskResponse / 250) * 100, max: 250, raw: breakdown.riskResponse },
    { axis: "Consistency", value: (breakdown.consistency / 200) * 100, max: 200, raw: breakdown.consistency },
  ];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CreditLaneBadge({ eligible }: { eligible: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        eligible
          ? "bg-emerald-400/10 text-emerald-400"
          : "bg-gray-700/60 text-gray-500"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          eligible ? "bg-emerald-400" : "bg-gray-600"
        }`}
      />
      {eligible ? "Credit Lane" : "Standard"}
    </span>
  );
}

const radarTooltipStyle = {
  background: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "12px",
};

function ScoreRadar({ record }: { record: ScoreRecord }) {
  const data = buildRadarData(record);
  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400">
          Score Breakdown
        </h3>
        <span className={`text-sm font-mono font-semibold ${scoreColor(record.score)}`}>
          {formatAddress(record.vault)}
        </span>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        Scores normalised to 100% per component for radar display. Raw values shown in tooltip.
      </p>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="#1f2937" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fill: "#6B7280", fontSize: 9 }}
              tickCount={4}
            />
            <Radar
              name={formatAddress(record.vault)}
              dataKey="value"
              stroke="#3B82F6"
              fill="#3B82F6"
              fillOpacity={0.18}
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={radarTooltipStyle}
              formatter={(_: number, __: string, props: { payload?: { raw?: number; max?: number } }) => {
                const raw = props?.payload?.raw ?? 0;
                const max = props?.payload?.max ?? 100;
                return [`${raw} / ${max}`, "Score"];
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Raw breakdown grid */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {data.map((d) => (
          <div key={d.axis} className="rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-center">
            <p className="text-xs text-gray-500">{d.axis}</p>
            <p className="text-base font-semibold text-white">{d.raw}</p>
            <p className="text-xs text-gray-600">/ {d.max}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScorePage() {
  const [selectedVault, setSelectedVault] = useState<ScoreRecord>(mockLeaderboard[0]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold tracking-tight">DrachmaScore Leaderboard</h1>
        <p className="mt-1 text-sm text-gray-400">
          On-chain reputation scores for autonomous vault agents. Updated every epoch via
          ScoreOracle.
        </p>
      </div>

      {/* Description card */}
      <div className="rounded-xl border border-dark-border bg-dark-card p-5">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-400">
          How DrachmaScore Works
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Yield Performance", max: 300, desc: "Annualised yield vs. benchmark. Rewards vaults that consistently outperform the risk-free rate." },
            { label: "Band Discipline", max: 250, desc: "Time spent within allocation bands. Penalises vaults that drift outside configured ranges." },
            { label: "Risk Response", max: 250, desc: "Speed and quality of response to depeg / macro alerts. Measured against consensus signals." },
            { label: "Consistency", max: 200, desc: "Low variance across epochs. Rewards predictable, stable agent behaviour over time." },
          ].map(({ label, max, desc }) => (
            <div
              key={label}
              className="rounded-lg border border-dark-border bg-dark-bg p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300">{label}</span>
                <span className="text-xs text-gray-500">/{max}</span>
              </div>
              <p className="text-xs leading-relaxed text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-600">
          Total max score: 1000. Vaults scoring ≥ 800 are eligible for the Credit Lane (undercollateralised
          flash credit facilities). Scores are stored on-chain and updated via IPFS-anchored evidence
          packages.
        </p>
      </div>

      {/* Leaderboard table */}
      <div className="rounded-xl border border-dark-border bg-dark-card p-5">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
          Leaderboard
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-dark-border text-xs text-gray-500">
                <th className="pb-2 pr-4">Rank</th>
                <th className="pb-2 pr-4">Vault</th>
                <th className="pb-2 pr-4">Score</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4 hidden md:table-cell">Last Updated</th>
                <th className="pb-2">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {mockLeaderboard.map((record) => (
                <tr
                  key={record.vault}
                  onClick={() => setSelectedVault(record)}
                  className={`cursor-pointer border-b border-dark-border/50 last:border-0 transition-colors hover:bg-white/[0.02] ${
                    selectedVault.vault === record.vault ? "bg-white/[0.04]" : ""
                  }`}
                >
                  <td className="py-3 pr-4">
                    <span
                      className={`text-sm font-bold ${
                        record.rank === 1
                          ? "text-amber-400"
                          : record.rank === 2
                          ? "text-gray-300"
                          : record.rank === 3
                          ? "text-amber-700"
                          : "text-gray-500"
                      }`}
                    >
                      #{record.rank}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-sm text-gray-300">
                    {formatAddress(record.vault)}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-sm font-bold ${scoreBg(record.score)}`}
                    >
                      {record.score}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <CreditLaneBadge eligible={record.creditLane} />
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-400 hidden md:table-cell">
                    {timeAgo(record.lastUpdate)}
                  </td>
                  <td className="py-3">
                    {record.ipfsCid ? (
                      <a
                        href={`${IPFS_GATEWAY}/${record.ipfsCid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        IPFS
                      </a>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-600">
          Click a row to view the score breakdown radar chart below.
        </p>
      </div>

      {/* Score breakdown radar */}
      <ScoreRadar record={selectedVault} />

      {/* Footer */}
      <p className="text-center text-xs text-gray-600">
        ScoreOracle contract:{" "}
        <span className="font-mono">0x0000000000000000000000000000000000000000</span>
        {" — "}
        scores updated every 6 hours in production
      </p>
    </div>
  );
}
