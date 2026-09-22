"use client";

import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AnalyticsSummary, Ranked } from "@/lib/analytics/summary";

const RANGES = [7, 30, 90] as const;

/** The event names as they read to a person. */
const EVENT_LABELS: Record<string, string> = {
  page_view: "Page views",
  valuation_run: "Valuations shown",
  valuation_blocked: "Valuations withheld",
  valuation_uncovered: "Withheld value uncovered",
  valuation_export: "Valuation exports",
  chart_saved: "Charts saved",
  chart_export: "Chart PNGs",
  search_open: "Search → ticker",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-wolf-border/50 bg-wolf-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mist/70">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-snow-peak">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-mist">{hint}</p> : null}
    </div>
  );
}

function RankedTable({ title, rows, unit, empty }: { title: string; rows: Ranked[]; unit: string; empty: string }) {
  const top = rows[0]?.hits ?? 0;
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-mist">{empty}</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.label} className="relative overflow-hidden rounded-md px-2 py-1.5">
                {/* The bar is the measurement, not decoration: width is the share of the top row. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-md bg-sunset-orange/[0.13]"
                  style={{ width: `${top > 0 ? Math.max(3, (r.hits / top) * 100) : 0}%` }}
                />
                <span className="relative flex items-baseline justify-between gap-3">
                  <span className="truncate font-mono text-[11px] text-snow-peak">{EVENT_LABELS[r.label] ?? r.label}</span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-mist">
                    {r.hits.toLocaleString()} {unit}
                    <span className="text-mist/50"> · {r.visitors.toLocaleString()} ppl</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsDashboard({ summary }: { summary: AnalyticsSummary }) {
  const { totals, daily, days } = summary;
  const returningShare = totals.visitors > 0 ? Math.round((totals.returningVisitors / totals.visitors) * 100) : 0;
  const viewsPerVisitor = totals.visitors > 0 ? (totals.views / totals.visitors).toFixed(1) : "0.0";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/app/admin/analytics?days=${r}`}
            className={cn(
              "rounded-lg px-2.5 py-1 font-mono text-[11px] transition-colors",
              r === days ? "bg-sunset-orange/15 text-sunset-orange ring-1 ring-inset ring-sunset-orange/30" : "text-mist hover:bg-snow-peak/[0.05] hover:text-snow-peak"
            )}
          >
            {r}d
          </Link>
        ))}
      </div>

      {summary.error ? (
        <div className="rounded-xl border border-bearish/30 bg-bearish/[0.07] p-4">
          <p className="text-sm font-medium text-snow-peak">No numbers yet</p>
          <p className="mt-1 text-xs leading-relaxed text-mist">
            The database said: <span className="font-mono text-mist/80">{summary.error}</span>
            <br />
            If this is the first run, apply <span className="font-mono">supabase/migrations/010_analytics_events.sql</span> in the Supabase SQL editor.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Visitors" value={totals.visitors.toLocaleString()} hint={`last ${days} days`} />
        <Stat label="Page views" value={totals.views.toLocaleString()} hint={`${viewsPerVisitor} per visitor`} />
        <Stat label="Came back" value={`${returningShare}%`} hint={`${totals.returningVisitors.toLocaleString()} on more than one day`} />
        <Stat label="Signed in" value={totals.signedIn.toLocaleString()} hint={`of ${summary.totalUsers.toLocaleString()} accounts`} />
      </div>

      <Card>
        <CardHeader className="p-4 pb-1">
          <CardTitle className="text-sm">Visitors per day</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {daily.length === 0 ? (
            <p className="py-10 text-center text-xs text-mist">Nothing recorded in this window yet.</p>
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="analytics-visitors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-sunset-orange)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-sunset-orange)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-wolf-border)" strokeOpacity={0.35} vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "var(--color-mist)", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis tick={{ fill: "var(--color-mist)", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-wolf-surface)",
                      border: "1px solid var(--color-wolf-border)",
                      borderRadius: 10,
                      fontSize: 11,
                    }}
                    labelStyle={{ color: "var(--color-mist)" }}
                    itemStyle={{ color: "var(--color-snow-peak)" }}
                  />
                  <Area type="linear" dataKey="visitors" name="Visitors" stroke="var(--color-sunset-orange)" strokeWidth={2} fill="url(#analytics-visitors)" />
                  <Area type="linear" dataKey="views" name="Views" stroke="var(--color-mist)" strokeWidth={1} strokeDasharray="3 3" fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <RankedTable title="What people do" rows={summary.events} unit="times" empty="No events recorded yet." />
        <RankedTable title="Companies looked up" rows={summary.tickers} unit="hits" empty="No company pages opened yet." />
        <RankedTable title="Pages" rows={summary.paths} unit="views" empty="No page views recorded yet." />
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Accounts created per week</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {summary.signups.length === 0 ? (
              <p className="py-6 text-center text-xs text-mist">No accounts created in the last 90 days.</p>
            ) : (
              <table className="w-full font-mono text-[11px] tabular-nums">
                <tbody>
                  {summary.signups.map((s) => (
                    <tr key={s.week} className="border-b border-wolf-border/30 last:border-0">
                      <td className="py-1.5 text-mist">week of {s.week}</td>
                      <td className="py-1.5 text-right text-snow-peak">{s.signups}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] leading-relaxed text-mist/70">
        Collected first-party: a random id in a 30-day httpOnly cookie, no IP address, no user agent, no fingerprint.
        Traffic in the aggregate is also in Google Analytics; this is the product side of it.
      </p>
    </div>
  );
}
