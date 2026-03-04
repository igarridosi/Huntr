"use client";

import type { ChangeEvent } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImportExportActionsProps {
  onExport: () => string;
  onImport: (csv: string) => void;
  listName: string;
}

export function ImportExportActions({ onExport, onImport, listName }: ImportExportActionsProps) {
  const inputId = `import-watchlist-${listName.toLowerCase().replace(/\s+/g, "-")}`;

  const handleExport = () => {
    const csv = onExport();
    if (!csv) return;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${listName.toLowerCase().replace(/\s+/g, "-")}-watchlist.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target?.result;
      if (typeof csv === "string") {
        onImport(csv);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleExport}>
        <Download className="h-3.5 w-3.5" /> Export
      </Button>
      <input id={inputId} type="file" accept=".csv" className="hidden" onChange={handleImport} />
      <label htmlFor={inputId} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-mist hover:text-snow-peak border border-transparent hover:border-wolf-border/50 cursor-pointer">
        <Upload className="h-3.5 w-3.5" /> Import
      </label>
    </div>
  );
}
