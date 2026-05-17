"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Allocation } from "@/lib/types";
import { formatPercent, formatUSD } from "@/lib/format";

interface Props {
  data: Allocation[];
}

export function AllocationChart({ data }: Props) {
  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-5">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
        Allocation
      </h3>
      <div className="flex items-center gap-6">
        <div className="h-48 w-48 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#1f2937",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  color: "#fff",
                }}
                formatter={(value: number) => formatUSD(value)}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-3">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm text-gray-300">
                {item.name}{" "}
                <span className="text-white font-medium">
                  {formatPercent(item.percent)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
