"use client";

import { useEffect, useRef, useState } from "react";
import { fragmentParams } from "@repo/core";

/**
 * Reads capability parameters (`#token=…`) once, then removes the fragment from the address
 * bar and history so the token isn't left in the URL, bookmarks or screenshots. `null` while
 * reading (first render), then the values (missing ones as undefined).
 */
export function useFragmentParams<K extends string>(keys: readonly K[]): Partial<Record<K, string>> | null {
  const [values, setValues] = useState<Partial<Record<K, string>> | null>(null);
  // Strict-mode effects run twice; the second run must not read the already-cleared fragment.
  const captured = useRef<Partial<Record<K, string>> | null>(null);
  useEffect(() => {
    if (captured.current) {
      setValues(captured.current);
      return;
    }
    const params = fragmentParams(window.location.hash);
    const out: Partial<Record<K, string>> = {};
    for (const key of keys) {
      const value = params.get(key);
      if (value) out[key] = value;
    }
    captured.current = out;
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    // Reading the browser location must wait for mount (no window during prerender).
    setValues(out);
    // Keys are static per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return values;
}
