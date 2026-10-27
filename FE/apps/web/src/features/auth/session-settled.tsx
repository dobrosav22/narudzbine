"use client";

import { useSession } from "@/lib/session";

/** Renders children once the stored session has been restored (signed in or out). */
export function SessionSettled({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const state = useSession();
  return state.status === "loading" ? <>{fallback}</> : <>{children}</>;
}
