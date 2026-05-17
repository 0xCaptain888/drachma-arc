"use client";

import { useState } from "react";

const tokens = ["USDC", "EURC", "USYC"] as const;
const tokenColors: Record<string, string> = {
  USDC: "border-usdc",
  EURC: "border-eurc",
  USYC: "border-usyc",
};

export function DepositWithdraw() {
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [token, setToken] = useState<string>("USDC");
  const [amount, setAmount] = useState("");

  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
        {mode === "deposit" ? "Deposit" : "Withdraw"}
      </h3>

      {/* Mode toggle */}
      <div className="mb-4 flex rounded-lg bg-dark-bg p-1">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition ${
              mode === m
                ? "bg-dark-card text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Token selector */}
      <div className="mb-4 flex gap-2">
        {tokens.map((t) => (
          <button
            key={t}
            onClick={() => setToken(t)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              token === t
                ? `${tokenColors[t]} text-white bg-white/5`
                : "border-dark-border text-gray-500 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Amount input */}
      <div className="mb-4">
        <input
          type="number"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2.5 text-white outline-none placeholder:text-gray-600 focus:border-usdc"
        />
      </div>

      <button className="w-full rounded-lg bg-usdc py-2.5 font-semibold text-white transition hover:bg-usdc/80">
        {mode === "deposit" ? "Deposit" : "Withdraw"} {token}
      </button>
    </div>
  );
}
