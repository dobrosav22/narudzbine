"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { OrganizationType } from "@repo/core";
import { ErrorState } from "@/components/query-states";
import { Spinner } from "@/components/ui/spinner";
import { homeFor, sessionStore, useSession } from "@/lib/session";

export function FullPageSpinner() {
  return (
    <div className="flex min-h-svh flex-1 items-center justify-center" aria-busy="true">
      <Spinner className="text-muted-foreground" />
    </div>
  );
}

/** The stored session could not be checked (rate limit, outage, offline); nothing was signed out. */
export function SessionUnavailable({ error }: { error: unknown }) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-1 items-center p-4">
      <div className="w-full">
        <ErrorState error={error} onRetry={() => void sessionStore.retry()} />
      </div>
    </div>
  );
}

/**
 * Client-side routing guard. Authorization itself is enforced by the backend on every call;
 * this only keeps people in the shell that matches their organization type.
 */
export function RequireOrg({ type, children }: { type: OrganizationType; children: React.ReactNode }) {
  const state = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const wrongRole = state.status === "admin" || (state.status === "business" && state.organization.type !== type);
  useEffect(() => {
    if (state.status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (wrongRole) router.replace(homeFor(state));
  }, [state, wrongRole, router, pathname]);

  if (state.status === "unavailable") return <SessionUnavailable error={state.error} />;
  if (state.status !== "business" || wrongRole) return <FullPageSpinner />;
  return <>{children}</>;
}

/** Login and other public auth pages: a signed-in user goes straight to their home. */
export function RedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  const state = useSession();
  const router = useRouter();
  useEffect(() => {
    if (state.status === "business" || state.status === "admin") router.replace(homeFor(state));
  }, [state, router]);
  // Public pages stay usable while the stored session can't be checked.
  if (state.status !== "signedOut" && state.status !== "unavailable") return <FullPageSpinner />;
  return <>{children}</>;
}

/** Platform admin shell: only a PLATFORM_ADMIN account gets in. */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const state = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (state.status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (state.status === "business") router.replace(homeFor(state));
  }, [state, router, pathname]);
  if (state.status === "unavailable") return <SessionUnavailable error={state.error} />;
  if (state.status !== "admin") return <FullPageSpinner />;
  return <>{children}</>;
}
