"use client";

import { MessageSquareText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const transcripts = [
  { ticker: "MSFT", quarter: "Q4 2026", title: "Earnings Call Transcript", minutes: "56 min" },
  { ticker: "AAPL", quarter: "Q3 2026", title: "Earnings Call Transcript", minutes: "48 min" },
  { ticker: "GOOGL", quarter: "Q2 2026", title: "Earnings Call Transcript", minutes: "52 min" },
  { ticker: "AMZN", quarter: "Q2 2026", title: "Earnings Call Transcript", minutes: "61 min" },
];

export default function TranscriptsPage() {
  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
          <MessageSquareText className="w-5 h-5 text-sunset-orange" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-snow-peak">Transcripts</h1>
          <p className="text-xs text-mist mt-0.5">Latest earnings call transcripts</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {transcripts.map((item) => (
            <div key={`${item.ticker}-${item.quarter}`} className="rounded-lg border border-wolf-border/40 bg-wolf-black/30 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-snow-peak">{item.ticker} · {item.quarter}</p>
                  <p className="text-xs text-mist">{item.title}</p>
                </div>
                <Badge variant="secondary" className="text-[10px]">{item.minutes}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
