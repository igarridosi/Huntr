"use client";

import { Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DcfCalculatorPage() {
  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sunset-orange/10 border border-sunset-orange/15">
          <Calculator className="w-5 h-5 text-sunset-orange" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-snow-peak">DCF Calculator</h1>
          <p className="text-xs text-mist mt-0.5">Discounted cash flow quick model</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Model Inputs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-mist leading-relaxed">
            Esta sección está lista para conectar el motor DCF. En el siguiente paso
            podemos añadir inputs interactivos (growth, discount rate, terminal multiple)
            y una salida de valor intrínseco por acción.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
