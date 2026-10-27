"use client";

import { useSyncExternalStore } from "react";
import { supportTimeLeft, type SupportAccess } from "@repo/core";

/** Support contexts for this tab, by organization id (memory only; never persisted or extended). */
const contexts = new Map<string, SupportAccess>();
const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version += 1;
  listeners.forEach((l) => l());
}
export function rememberSupportContext(access: SupportAccess) {
  contexts.set(access.organizationId, access);
  emit();
}

export function forgetSupportContext(organizationId: string) {
  if (contexts.delete(organizationId)) emit();
}
export function useSupportContext(organizationId: string): SupportAccess | null {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => version,
  );
  const ctx = contexts.get(organizationId) ?? null;
  return ctx && supportTimeLeft(ctx.expiresAt) > 0 ? ctx : null;
}

