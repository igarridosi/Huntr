"use client";

import {
  MessageSquareText,
  Construction,
  TimerReset,
  Rocket,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-28 left-[-120px] h-72 w-72 rounded-full bg-sunset-orange/10 blur-3xl" />
          <div className="absolute -bottom-24 right-[-90px] h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_46%)]" />
        </div>

        <CardHeader className="relative">
          <CardTitle className="text-base text-snow-peak">Section status</CardTitle>
          <p className="text-xs text-mist mt-1">
            This section is temporarily paused until premium data providers are integrated.
          </p>
        </CardHeader>

        <CardContent className="relative">
          <div className="relative min-h-[540px] rounded-2xl border border-wolf-border/45 bg-wolf-black/35">
            <div className="absolute inset-0 p-4 sm:p-6 blur-[3px] select-none">
              <div className="grid gap-4 lg:grid-cols-[260px_1fr] h-full">
                <div className="rounded-xl border border-wolf-border/40 bg-wolf-black/35 p-3 space-y-2">
                  {Array.from({ length: 7 }).map((_, idx) => (
                    <div key={idx} className="h-14 rounded-lg border border-wolf-border/35 bg-wolf-black/45" />
                  ))}
                </div>

                <div className="rounded-xl border border-wolf-border/40 bg-wolf-black/35 p-3 flex flex-col gap-3">
                  <div className="h-20 rounded-lg border border-wolf-border/35 bg-wolf-black/45" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="h-10 rounded-lg border border-wolf-border/35 bg-wolf-black/45" />
                    <div className="h-10 rounded-lg border border-wolf-border/35 bg-wolf-black/45" />
                  </div>
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <div key={idx} className="h-20 rounded-lg border border-wolf-border/35 bg-wolf-black/45" />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8">
              <div className="w-full max-w-3xl rounded-2xl border border-snow-peak/20 bg-wolf-black/35 backdrop-blur-xl px-5 py-6 sm:px-8 sm:py-8 text-center shadow-2xl">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-sunset-orange/30 bg-sunset-orange/12">
                  <Construction className="h-7 w-7 text-sunset-orange" />
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-snow-peak tracking-tight">
                  Transcripts under construction
                </h2>

                <p className="mt-3 text-sm sm:text-base leading-relaxed text-mist">
                  At this stage, we cannot reliably receive transcript data with the quality and coverage this module
                  requires. We decided to pause this section temporarily and resume it once we can invest in paid,
                  specialized APIs for official earnings call transcripts.
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <Badge variant="secondary" className="inline-flex items-center gap-1.5 text-[11px]">
                    <TimerReset className="h-3.5 w-3.5" /> Active improvement phase
                  </Badge>
                  <Badge variant="secondary" className="inline-flex items-center gap-1.5 text-[11px]">
                    <Rocket className="h-3.5 w-3.5" /> Premium data roadmap
                  </Badge>
                </div>

                <p className="mt-4 text-xs text-mist/85">
                  Thanks for supporting this project. We are continuously improving each module so the final product
                  can truly stand out.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
