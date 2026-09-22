import { notFound } from "next/navigation";
import { BarChart3, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAnalyticsSummary } from "@/lib/analytics/summary";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export const metadata = { title: "Analytics", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Who may read the numbers. Empty list closes the page for everyone. */
function admins(): string[] {
  return (process.env.ANALYTICS_ADMIN_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const allowed = admins();
  // A 404 rather than a 403: the page does not exist for anyone else.
  if (!data.user || allowed.length === 0 || !allowed.includes(data.user.id)) notFound();

  const { days: rawDays } = await searchParams;
  const parsed = Number(rawDays);
  const days = [7, 30, 90].includes(parsed) ? parsed : 30;

  const summary = await getAnalyticsSummary(days);

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sunset-orange/15 bg-sunset-orange/10">
          <BarChart3 className="h-5 w-5 text-sunset-orange" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-snow-peak">Analytics</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-mist">
            <Users className="h-3 w-3" />
            {summary.totalUsers} account{summary.totalUsers === 1 ? "" : "s"} in total · first-party, cookie-anonymous
          </p>
        </div>
      </div>

      <AnalyticsDashboard summary={summary} />
    </div>
  );
}
