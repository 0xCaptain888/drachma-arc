"use client";

import { useState } from "react";
import { DepositWithdraw } from "./DepositWithdraw";
import { BandSliders } from "./BandSliders";
import { OwnerProfile } from "./OwnerProfile";
import { DecisionLogTable } from "@/components/DecisionLogTable";
import { mockDecisionLog } from "@/lib/mockData";

export default function AppPage() {
  const [connected, setConnected] = useState(false);
  const mockAddress = "0x7a3b...f9e2";

  if (!connected) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Owner Control Panel</h1>
        <p className="text-gray-400">Connect your wallet to manage the vault</p>
        <button
          onClick={() => setConnected(true)}
          className="rounded-lg bg-usdc px-6 py-3 font-semibold text-white transition hover:bg-usdc/80"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Control Panel</h1>
          <p className="text-sm text-gray-400">Manage your Drachma vault</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-dark-card border border-dark-border px-3 py-1 text-sm text-gray-300">
            {mockAddress}
          </span>
          <button
            onClick={() => setConnected(false)}
            className="text-sm text-gray-500 hover:text-white"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Top row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DepositWithdraw />
        <BandSliders />
      </div>

      {/* Owner profile */}
      <OwnerProfile />

      {/* Full decision log */}
      <DecisionLogTable entries={mockDecisionLog} />
    </div>
  );
}
