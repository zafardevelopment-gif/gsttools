"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SalesPoint, ModeSlice } from "@/server/queries/charts";

/**
 * Dashboard charts. Colors come from the validated categorical palette
 * (--chart-1..5) which passes CVD/contrast checks on both surfaces; identity is
 * never color-alone (axis labels name every bar; the trend is a single series).
 */
const C1 = "var(--chart-1)";
const MODE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-1.5 text-xs shadow-md">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{inr(Number(payload[0].value ?? 0))}</p>
    </div>
  );
}

export function DashboardCharts({
  salesTrend,
  paymentModes,
}: {
  salesTrend: SalesPoint[];
  paymentModes: ModeSlice[];
}) {
  const hasSales = salesTrend.some((p) => p.sales > 0);

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-5">
      {/* Sales trend — single series, no legend needed (title names it). */}
      <Card className="lg:col-span-3">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold">
            Sales — last 30 days
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {!hasSales ? (
            <p className="flex h-52 items-center justify-center text-sm text-muted-foreground">
              Abhi koi sale nahi — pehla invoice banate hi trend yahan dikhega.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={salesTrend} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C1} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={C1} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={(v: number) => inr(v)}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke={C1}
                  strokeWidth={2}
                  fill="url(#salesFill)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Payment mode split — horizontal bars, axis names each category. */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold">
            Collections by mode — this month
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {paymentModes.length === 0 ? (
            <p className="flex h-52 items-center justify-center text-sm text-muted-foreground">
              Is mahine abhi koi payment receive nahi hui.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart
                data={paymentModes}
                layout="vertical"
                margin={{ top: 4, right: 48, left: 0, bottom: 0 }}
                barCategoryGap="28%"
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="mode"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={58}
                  tickFormatter={(v: string) => v.toUpperCase()}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {paymentModes.map((m, i) => (
                    <Cell key={m.mode} fill={MODE_COLORS[i % MODE_COLORS.length]} />
                  ))}
                  <LabelList
                    dataKey="amount"
                    position="right"
                    formatter={(v: React.ReactNode) => inr(Number(v))}
                    style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
