"use client";

import { BriefcaseBusiness } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const portfolios = [
  { name: "Core Compounders", positions: 8, exposure: "62%" },
  { name: "Dividend Income", positions: 6, exposure: "24%" },
  { name: "Opportunistic", positions: 4, exposure: "14%" },
];

export default function PortfoliosPage() {
  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
          <BriefcaseBusiness className="w-5 h-5 text-sunset-orange" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-snow-peak">Portfolios</h1>
          <p className="text-xs text-mist mt-0.5">Track allocation and exposures</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">My Portfolios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {portfolios.map((portfolio) => (
            <div key={portfolio.name} className="flex items-center justify-between rounded-lg border border-wolf-border/40 bg-wolf-black/30 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-snow-peak">{portfolio.name}</p>
                <p className="text-xs text-mist">{portfolio.positions} positions</p>
              </div>
              <Badge variant="golden" className="font-mono text-xs">
                {portfolio.exposure}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
