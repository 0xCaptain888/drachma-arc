"use client";

import { formatUSD } from "@/lib/format";

interface Props {
  yieldAccrued: number;
  usycApy: number;
}

export function YieldCard({ yieldAccrued, usycApy }: Props) {
  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      <h3 className="mb-1 text-sm font-medium uppercase tracking-wider text-gray-400">
        Yield Accrued
      </h3>
      <p className="text-3xl font-bold text-usyc">{formatUSD(yieldAccrued)}</p>
      <p className="mt-1 text-xs text-gray-500">
        USYC APY: {usycApy.toFixed(1)}%
      </p>
    </div>
  );
}
