"use client";

import { useState } from "react";

const tokens = ["USDC", "EURC", "USYC"] as const;
const tokenColors: Record<string, string> = {
  USDC: "border-usdc",
  EURC: "border-eurc",
  USYC: "border-usyc",
};

// Production: sponsor owner tx via Paymaster
// const sponsoredTx = await paymasterClient.sponsorUserOperation({
//   userOperation: {
//     sender: ownerAddress,
//     callData: vault.interface.encodeFunctionData('deposit', [USDC, amount]),
//   },
//   entryPoint: ARC_ENTRYPOINT,
// });

type PaymasterStatus = "active" | "inactive" | "pending";

function PaymasterStatusIndicator({ status }: { status: PaymasterStatus }) {
  const statusConfig: Record<PaymasterStatus, { color: string; label: string }> = {
    active: { color: "bg-green-500", label: "Paymaster Active" },
    inactive: { color: "bg-red-500", label: "Paymaster Offline" },
    pending: { color: "bg-yellow-500", label: "Paymaster Pending" },
  };

  const { color, label } = statusConfig[status];

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </div>
  );
}

function SponsoredBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-green-800 bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-400">
      <svg
        className="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Sponsored by Paymaster
    </span>
  );
}

export function DepositWithdraw() {
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [token, setToken] = useState<string>("USDC");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Mock Paymaster status - in production this would query the Paymaster contract
  const paymasterStatus: PaymasterStatus = "active";

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) return;
    setSubmitting(true);
    setTxStatus("Requesting Paymaster sponsorship...");

    // Simulate Paymaster sponsorship flow
    await new Promise((r) => setTimeout(r, 800));
    setTxStatus("Gas sponsored. Submitting transaction...");

    await new Promise((r) => setTimeout(r, 1200));
    setTxStatus(
      `${mode === "deposit" ? "Deposit" : "Withdrawal"} of ${amount} ${token} complete (gas: $0.00)`
    );
    setSubmitting(false);

    // Clear after 4s
    setTimeout(() => setTxStatus(null), 4000);
  };

  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      {/* Header row with Paymaster status */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400">
          {mode === "deposit" ? "Deposit" : "Withdraw"}
        </h3>
        <PaymasterStatusIndicator status={paymasterStatus} />
      </div>

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

      {/* Gas savings indicator */}
      <div className="mb-3 flex items-center justify-between rounded-lg bg-dark-bg px-3 py-2 text-xs">
        <span className="text-gray-500">Estimated gas cost</span>
        <span className="font-medium text-green-400">$0.00 (sponsored)</span>
      </div>

      {/* Submit button row */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting || !amount}
          className="flex-1 rounded-lg bg-usdc py-2.5 font-semibold text-white transition hover:bg-usdc/80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? "Processing..."
            : `${mode === "deposit" ? "Deposit" : "Withdraw"} ${token}`}
        </button>
        <SponsoredBadge />
      </div>

      {/* Transaction status */}
      {txStatus && (
        <div className="mt-3 rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-xs text-gray-300">
          {txStatus}
        </div>
      )}
    </div>
  );
}
