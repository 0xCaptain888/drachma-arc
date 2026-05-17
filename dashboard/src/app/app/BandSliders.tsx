"use client";

import { useState } from "react";

interface Band {
  label: string;
  color: string;
  min: number;
  max: number;
}

const initial: Band[] = [
  { label: "USDC", color: "#1A56DB", min: 20, max: 50 },
  { label: "EURC", color: "#0E9F6E", min: 15, max: 40 },
  { label: "USYC", color: "#B45309", min: 20, max: 60 },
];

export function BandSliders() {
  const [bands, setBands] = useState<Band[]>(initial);

  const update = (idx: number, field: "min" | "max", val: number) => {
    setBands((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, [field]: val } : b))
    );
  };

  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
        Allocation Bands
      </h3>
      <div className="space-y-5">
        {bands.map((band, i) => (
          <div key={band.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium" style={{ color: band.color }}>
                {band.label}
              </span>
              <span className="text-gray-400">
                {band.min}% - {band.max}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-8">Min</span>
              <input
                type="range"
                min={0}
                max={100}
                value={band.min}
                onChange={(e) => update(i, "min", Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: band.color }}
              />
              <span className="text-xs text-gray-500 w-8">Max</span>
              <input
                type="range"
                min={0}
                max={100}
                value={band.max}
                onChange={(e) => update(i, "max", Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: band.color }}
              />
            </div>
          </div>
        ))}
      </div>
      <button className="mt-4 w-full rounded-lg border border-dark-border py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5">
        Update Bands
      </button>
    </div>
  );
}
