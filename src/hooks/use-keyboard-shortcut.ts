"use client";

import { useEffect, useCallback } from "react";

type KeyCombo = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

/**
 * Generic keyboard shortcut hook.
 * Supports Cmd+K (Mac) / Ctrl+K (Windows) and other combos.
 *
 * @param combo - Key combination to listen for
 * @param callback - Function to execute when shortcut is triggered
 * @param enabled - Whether the shortcut is active (default: true)
 */
export function useKeyboardShortcut(
  combo: KeyCombo,
  callback: (e: KeyboardEvent) => void,
  enabled: boolean = true
) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const keyMatch = e.key.toLowerCase() === combo.key.toLowerCase();
      const metaMatch = combo.metaKey ? e.metaKey || e.ctrlKey : true;
      const ctrlMatch = combo.ctrlKey ? e.ctrlKey : true;
      const shiftMatch = combo.shiftKey ? e.shiftKey : !e.shiftKey;
      const altMatch = combo.altKey ? e.altKey : !e.altKey;

      if (keyMatch && metaMatch && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault();
        callback(e);
      }
    },
    [combo, callback, enabled]
  );

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, enabled]);
}
