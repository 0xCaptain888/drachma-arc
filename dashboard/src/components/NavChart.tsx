"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { NavDataPoint } from "@/lib/types";

interface Props {
  data: NavDataPoint[];
}

const customTooltipStyle = {
  background: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "12px",
};

export function NavChart({ data }: Props) {
  const min = Math.min(...data.map((d) => d.nav));
  const max = Math.max(...data.map((d) => d.nav));
  // Add a small margin so the line doesn't sit at the edges
  const domainMin = Math.floor(min * 1_000_000 - 50) / 1_000_000;
  const domainMax = Math.ceil(max * 1_000_000 + 50) / 1_000_000;

  return (
    <div style={{ width: "100%", height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <XAxis
            dataKey="date"
            tick={{ fill: "#6B7280", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[domainMin, domainMax]}
            tick={{ fill: "#6B7280", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v.toFixed(6)}
            width={68}
          />
          <Tooltip
            contentStyle={customTooltipStyle}
            formatter={(v: number) => [v.toFixed(6), "NAV/share"]}
            labelStyle={{ color: "#9CA3AF", marginBottom: 2 }}
          />
          <Line
            type="monotone"
            dataKey="nav"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#3B82F6", stroke: "#1f2937", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
