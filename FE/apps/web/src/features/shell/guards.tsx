"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { OrgType } from "@repo/core";
import { Spinner } from "@/components/ui/spinner";
import { homeFor, useSession } from "@/lib/session";

export function FullPageSpinner() {
  return (
    <div className="flex min-h-svh flex-1 items-center justify-center" aria-busy="true">
      <Spinner className="text-muted-foreground" />
    </div>
  );
}

/**
 * Client-side guard: data lives in the browser while mocked (BUILD_LOG
 * "Mock runtime behaviour"), so there's no server session to check. When a
 * real backend lands this can move to middleware.
 */
export function RequireRole({ orgType, children }: { orgType: OrgType; children: React.ReactNode }) {
  const state = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // An admin session (no org) is always the wrong role here.
  const wrongRole = state.status === "admin" || (state.status === "signedIn" && state.membership.orgType !== orgType);
  useEffect(() => {
    if (state.status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (wrongRole) router.replace(homeFor(state));
  }, [state, wrongRole, router, pathname]);

  if (state.status !== "signedIn" || wrongRole) return <FullPageSpinner />;
  return <>{children}</>;
}

/** Login/register: a signed-in user goes straight to their home. */
export function RedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  const state = useSession();
  const router = useRouter();
  useEffect(() => {
    if (state.status === "signedIn" || state.status === "admin") router.replace(homeFor(state));
  }, [state, router]);
  if (state.status !== "signedOut") return <FullPageSpinner />;
  return <>{children}</>;
}

/**
 * v1.1 admin shell guard (02 "Admin panel"): only a PlatformAdmin session gets in; a vendor or
 * buyer is sent to their own home, a signed-out visitor to login.
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const state = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (state.status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (state.status === "signedIn") router.replace(homeFor(state));
  }, [state, router, pathname]);
  if (state.status !== "admin") return <FullPageSpinner />;
  return <>{children}</>;
}
