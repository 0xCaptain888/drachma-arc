"use client";

import { useState } from "react";

export function OwnerProfile() {
  const [currencies, setCurrencies] = useState("EUR, USD");
  const [outflow, setOutflow] = useState("3000");
  const [risk, setRisk] = useState("moderate");
  const [payments, setPayments] = useState("Rent EUR 1200 on 1st, Insurance EUR 300 on 15th");

  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
        Owner Profile
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Spending currencies" value={currencies} onChange={setCurrencies} />
        <Field label="Monthly outflow (USD)" value={outflow} onChange={setOutflow} />
        <div>
          <label className="mb-1 block text-sm text-gray-400">Risk tolerance</label>
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-white outline-none"
          >
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
        <Field label="Upcoming payments" value={payments} onChange={setPayments} />
      </div>
      <button className="mt-4 rounded-lg bg-usdc px-5 py-2 text-sm font-semibold text-white transition hover:bg-usdc/80">
        Save Profile
      </button>
    </div>
  );
}

function Field({
  label, value, onChange,
}: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-white outline-none placeholder:text-gray-600 focus:border-usdc"
      />
    </div>
  );
}
