"use client";

import { formatUSD } from "@/lib/format";

interface Props {
  totalAum: number;
  usdcBalance: number;
  eurcBalance: number;
  eurcValueUsd: number;
  usycShares: number;
  usycValueUsd: number;
}

export function AumCard(props: Props) {
  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      <h3 className="mb-1 text-sm font-medium uppercase tracking-wider text-gray-400">
        Total AUM
      </h3>
      <p className="mb-4 text-4xl font-bold tracking-tight">
        {formatUSD(props.totalAum)}
      </p>
      <div className="grid grid-cols-3 gap-3">
        <TokenRow
          label="USDC"
          amount={formatUSD(props.usdcBalance)}
          color="text-usdc"
        />
        <TokenRow
          label="EURC"
          amount={`€${props.eurcBalance.toFixed(2)}`}
          sub={formatUSD(props.eurcValueUsd)}
          color="text-eurc"
        />
        <TokenRow
          label="USYC"
          amount={`${props.usycShares.toFixed(2)} sh`}
          sub={formatUSD(props.usycValueUsd)}
          color="text-usyc"
        />
      </div>
    </div>
  );
}

function TokenRow({
  label,
  amount,
  sub,
  color,
}: {
  label: string;
  amount: string;
  sub?: string;
  color: string;
}) {
  return (
    <div>
      <p className={`text-xs font-semibold ${color}`}>{label}</p>
      <p className="text-sm font-medium text-white">{amount}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
