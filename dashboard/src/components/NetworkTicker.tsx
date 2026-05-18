"use client";

import { Signal } from "@/lib/types";
import { SIGNAL_TYPE_LABELS, SIGNAL_TYPE_COLORS } from "@/lib/constants";
import { formatAddress, timeAgo } from "@/lib/format";

interface Props {
  signals: Signal[];
}

function formatSignalValue(type: number, value: number): string {
  // type 0 = EURC Spread (bps), type 1 = USYC NAV (scaled by 10000), others generic
  if (type === 0) return `${value}bps`;
  if (type === 1) return `$${(value / 10000).toFixed(4)}`;
  if (type === 5) return `+${value}bps APY`;
  return `${value > 0 ? "+" : ""}${value}`;
}

function TickerItem({ signal }: { signal: Signal }) {
  const label = SIGNAL_TYPE_LABELS[signal.signalType] ?? `Type ${signal.signalType}`;
  const color = SIGNAL_TYPE_COLORS[signal.signalType] ?? "#9CA3AF";
  const formattedValue = formatSignalValue(signal.signalType, signal.value);

  return (
    <span className="inline-flex items-center gap-2 px-6 shrink-0">
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-gray-400">
        Vault{" "}
        <span className="font-mono text-gray-300">
          {formatAddress(signal.vault)}
        </span>{" "}
        submitted{" "}
        <span className="font-medium" style={{ color }}>
          {label}
        </span>{" "}
        signal (
        <span className="text-white">{formattedValue}</span>){" — "}
        <span className="text-gray-500">{timeAgo(signal.timestamp)}</span>
      </span>
    </span>
  );
}

export function NetworkTicker({ signals }: Props) {
  if (signals.length === 0) return null;

  // Duplicate items so the scroll loops seamlessly
  const items = [...signals, ...signals];

  return (
    <div className="relative overflow-hidden rounded-xl border border-dark-border bg-dark-card py-2.5">
      {/* Left fade */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-dark-card to-transparent" />
      {/* Right fade */}
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-dark-card to-transparent" />

      <div
        className="flex whitespace-nowrap text-sm"
        style={{
          animation: `ticker-scroll ${signals.length * 6}s linear infinite`,
        }}
      >
        {items.map((signal, i) => (
          <TickerItem key={`${signal.vault}-${signal.timestamp}-${i}`} signal={signal} />
        ))}
      </div>
    </div>
  );
}
