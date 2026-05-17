"use client";

interface Props {
  active: boolean;
  lastDecision: string;
  nextCycle: string;
}

export function StatusBadge({ active, lastDecision, nextCycle }: Props) {
  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-400">
        Agent Status
      </h3>
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            active ? "bg-emerald-400 animate-pulse" : "bg-red-500"
          }`}
        />
        <span className="text-sm font-medium">
          {active ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="space-y-1 text-xs text-gray-400">
        <p>Last decision: {lastDecision}</p>
        <p>Next cycle: {nextCycle}</p>
      </div>
    </div>
  );
}
