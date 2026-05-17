"use client";

import { DecisionLogEntry } from "@/lib/types";
import { formatTimestamp, formatPercent } from "@/lib/format";
import { IPFS_GATEWAY } from "@/lib/constants";

const ACTION_COLORS: Record<string, string> = {
  HOLD: "bg-gray-700 text-gray-300",
  REBALANCE: "bg-usdc/20 text-blue-300",
  YIELD_HARVEST: "bg-usyc/20 text-amber-300",
  FX_HEDGE: "bg-eurc/20 text-emerald-300",
  DEPOSIT: "bg-emerald-900/40 text-emerald-300",
  WITHDRAW: "bg-red-900/40 text-red-300",
};

interface Props {
  entries: DecisionLogEntry[];
  compact?: boolean;
}

export function DecisionLogTable({ entries, compact }: Props) {
  const shown = compact ? entries.slice(0, 8) : entries;

  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
        Decision Log
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-dark-border text-xs text-gray-500">
              <th className="pb-2 pr-4">#</th>
              <th className="pb-2 pr-4">Time</th>
              <th className="pb-2 pr-4">Action</th>
              <th className="pb-2 pr-4">Confidence</th>
              <th className="pb-2 pr-4 hidden md:table-cell">Summary</th>
              <th className="pb-2">IPFS</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr
                key={e.id}
                className="border-b border-dark-border/50 last:border-0"
              >
                <td className="py-2 pr-4 text-gray-500">{e.id}</td>
                <td className="py-2 pr-4 text-gray-300 whitespace-nowrap">
                  {formatTimestamp(e.timestamp)}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                      ACTION_COLORS[e.action] ?? "bg-gray-700"
                    }`}
                  >
                    {e.action}
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-300">
                  {formatPercent(e.confidence)}
                </td>
                <td className="py-2 pr-4 text-gray-400 hidden md:table-cell max-w-xs truncate">
                  {e.summary}
                </td>
                <td className="py-2">
                  <a
                    href={`${IPFS_GATEWAY}/${e.ipfsHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-usdc hover:underline text-xs"
                  >
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
