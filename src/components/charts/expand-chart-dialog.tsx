"use client";

import { useState, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ExpandChartDialogProps {
  title: string;
  children: ReactNode;
  headerRight?: ReactNode;
  footer?: ReactNode;
}

export function ExpandChartDialog({
  title,
  children,
  headerRight,
  footer,
}: ExpandChartDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-snow-peak/[0.04] text-mist ring-1 ring-inset ring-wolf-border/45 transition-[background-color,color,transform] duration-150 ease-out hover:bg-snow-peak/[0.08] hover:text-snow-peak active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100 sm:h-7 sm:w-7"
        aria-label={`Expand ${title} chart`}
        title="Expand chart"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-6xl overflow-hidden p-0">
        <DialogHeader className="border-b border-wolf-border/40 px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-sm md:text-base">{title}</DialogTitle>
            <div className="flex items-center gap-2">
              {headerRight}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Close chart dialog"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="p-4 md:p-6">{children}</div>
        {footer ? (
          <div className="border-t border-wolf-border/40 bg-snow-peak/[0.02] px-5 py-3">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
