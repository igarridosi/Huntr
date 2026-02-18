"use client";

import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const upcoming = [
  { ticker: "MSFT", company: "Microsoft", date: "Jul 24, 2026", when: "After Market" },
  { ticker: "AAPL", company: "Apple", date: "Jul 30, 2026", when: "After Market" },
  { ticker: "NVDA", company: "NVIDIA", date: "Aug 21, 2026", when: "After Market" },
  { ticker: "JPM", company: "JPMorgan", date: "Apr 12, 2026", when: "Before Open" },
];

export default function EarningsPage() {
  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
          <CalendarClock className="w-5 h-5 text-sunset-orange" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-snow-peak">Earnings</h1>
          <p className="text-xs text-mist mt-0.5">Upcoming earnings calendar</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Next Reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.map((item) => (
            <div key={item.ticker} className="flex items-center justify-between rounded-lg border border-wolf-border/40 bg-wolf-black/30 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-snow-peak">{item.ticker}</p>
                <p className="text-xs text-mist">{item.company}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono text-snow-peak">{item.date}</p>
                <Badge variant="secondary" className="mt-1 text-[10px]">{item.when}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
