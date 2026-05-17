"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatUSD } from "@/lib/format";

const strategies = [
  { label: "Bank wire (no hedge)", fxMarkup: 0.03 },
  { label: "Wise / Revolut", fxMarkup: 0.005 },
  { label: "Hold USDC only", fxMarkup: 0 },
];

export default function CalculatePage() {
  const [income, setIncome] = useState(5000);
  const [eurPct, setEurPct] = useState(40);
  const [stratIdx, setStratIdx] = useState(0);

  const result = useMemo(() => {
    const annual = income * 12;
    const eurSpend = (eurPct / 100) * annual;
    const usdHold = annual - eurSpend;

    // FX loss: EUR/USD annual vol ~8%, expected loss ~half the vol
    const fxLoss = eurSpend * 0.08 * 0.5;
    const fxMarkupLoss = eurSpend * strategies[stratIdx].fxMarkup;

    // Yield loss: opportunity cost of not earning USYC 4.5% on USD portion
    const yieldLoss = usdHold * 0.045;

    const totalLoss = fxLoss + fxMarkupLoss + yieldLoss;
    const daysOfSalary = (totalLoss / (annual / 365)).toFixed(1);

    return { fxLoss, fxMarkupLoss, yieldLoss, totalLoss, daysOfSalary };
  }, [income, eurPct, stratIdx]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Cash Loss Calculator
        </h1>
        <p className="mt-2 text-gray-400">
          How much are you losing to FX volatility and idle cash?
        </p>
      </div>

      {/* Inputs */}
      <div className="rounded-xl border border-dark-border bg-dark-card p-6 space-y-5">
        <InputField
          label="Monthly income (USDC)"
          value={income}
          onChange={setIncome}
          prefix="$"
        />
        <SliderField
          label={`EUR spending: ${eurPct}%`}
          value={eurPct}
          onChange={setEurPct}
        />
        <SelectField
          label="Current strategy"
          options={strategies.map((s) => s.label)}
          value={stratIdx}
          onChange={setStratIdx}
        />
      </div>

      {/* Results */}
      <ResultsPanel result={result} />

      {/* CTA */}
      <div className="text-center">
        <Link
          href="/"
          className="inline-block rounded-lg bg-usdc px-6 py-3 font-semibold text-white transition hover:bg-usdc/80"
        >
          See how Drachma eliminates this
        </Link>
      </div>
    </div>
  );
}

function ResultsPanel({
  result,
}: {
  result: {
    fxLoss: number;
    fxMarkupLoss: number;
    yieldLoss: number;
    totalLoss: number;
    daysOfSalary: string;
  };
}) {
  return (
    <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 space-y-4">
      <h2 className="text-lg font-semibold text-red-300">
        Your estimated annual losses
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <LossRow label="FX volatility drag" value={result.fxLoss} />
        <LossRow label="FX conversion fees" value={result.fxMarkupLoss} />
        <LossRow label="Missed yield (USYC 4.5%)" value={result.yieldLoss} />
      </div>
      <div className="border-t border-red-900/50 pt-4">
        <p className="text-3xl font-bold text-red-400">
          {formatUSD(result.totalLoss)}
          <span className="text-base font-normal text-red-300">/year</span>
        </p>
        <p className="mt-1 text-sm text-gray-400">
          That is {result.daysOfSalary} days of your salary, gone.
        </p>
      </div>
    </div>
  );
}

function LossRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-red-300">{formatUSD(value)}</p>
    </div>
  );
}

function InputField({
  label, value, onChange, prefix,
}: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      <div className="flex items-center rounded-lg border border-dark-border bg-dark-bg px-3 py-2">
        {prefix && <span className="mr-1 text-gray-500">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full bg-transparent text-white outline-none"
        />
      </div>
    </div>
  );
}

function SliderField({
  label, value, onChange,
}: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-eurc"
      />
    </div>
  );
}

function SelectField({
  label, options, value, onChange,
}: {
  label: string; options: string[]; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-white outline-none"
      >
        {options.map((opt, i) => (
          <option key={i} value={i}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
