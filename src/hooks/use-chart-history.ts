"use client";

import { useCallback, useRef, useState } from "react";
import type { ChartSpec } from "@/lib/chart-builder";

const MAX_HISTORY = 50;
/** Edits with the same key inside this window collapse into one undo step. */
const COALESCE_MS = 300;

export interface ChartHistory {
  spec: ChartSpec;
  /**
   * Records a new state. `coalesce` names a stream of rapid edits (a colour
   * swatch being scrubbed, a title being typed) that should undo as one.
   */
  update: (next: ChartSpec | ((prev: ChartSpec) => ChartSpec), coalesce?: string) => void;
  /** Replaces the whole history — loading a template or a saved chart. */
  reset: (spec: ChartSpec) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Undo/redo over the spec. Every edit goes through here so ⌘Z is a single
 * mechanism rather than something each control has to remember.
 */
export function useChartHistory(initial: ChartSpec): ChartHistory {
  const [state, setState] = useState<{ past: ChartSpec[]; present: ChartSpec; future: ChartSpec[] }>({
    past: [],
    present: initial,
    future: [],
  });
  const lastEdit = useRef<{ key: string; at: number } | null>(null);

  const update = useCallback<ChartHistory["update"]>((next, coalesce) => {
    const now = Date.now();
    const merge = !!coalesce && lastEdit.current?.key === coalesce && now - lastEdit.current.at < COALESCE_MS;
    lastEdit.current = coalesce ? { key: coalesce, at: now } : null;

    setState((s) => {
      const present = typeof next === "function" ? next(s.present) : next;
      if (present === s.present) return s;
      const past = merge ? s.past : [...s.past, s.present].slice(-MAX_HISTORY);
      return { past, present, future: [] };
    });
  }, []);

  const reset = useCallback((spec: ChartSpec) => {
    lastEdit.current = null;
    setState({ past: [], present: spec, future: [] });
  }, []);

  const undo = useCallback(() => {
    lastEdit.current = null;
    setState((s) => {
      if (s.past.length === 0) return s;
      const present = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), present, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    lastEdit.current = null;
    setState((s) => {
      if (s.future.length === 0) return s;
      const [present, ...future] = s.future;
      return { past: [...s.past, s.present], present, future };
    });
  }, []);

  return {
    spec: state.present,
    update,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
