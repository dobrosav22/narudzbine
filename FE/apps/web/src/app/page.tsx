"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { parseClientLink, type ClientLink, type SessionState } from "@repo/core";
import { FullPageSpinner, SessionUnavailable } from "@/features/shell/guards";
import { homeFor, useSession } from "@/lib/session";

/**
 * Entry point. Backend emails and push notifications link to the client base plus a fragment
 * (`/#/password-reset?token=…`, `/#/orders/{id}`, …); fragments never reach a server, so tokens
 * stay out of logs. Public capabilities are forwarded in a fragment again; authenticated links
 * go to the matching screen of the signed-in shell (or through login). Anything else goes home.
 */
export default function Home() {
  const state = useSession();
  const router = useRouter();
  useEffect(() => {
    if (state.status === "loading" || state.status === "unavailable") return;
    const link = parseClientLink(window.location.hash);
    router.replace(link ? targetFor(link, state) : homeFor(state));
  }, [state, router]);
  if (state.status === "unavailable") return <SessionUnavailable error={state.error} />;
  return <FullPageSpinner />;
}

function targetFor(link: ClientLink, state: SessionState): string {
  const fragment = (params: Record<string, string>) => `#${new URLSearchParams(params).toString()}`;
  switch (link.kind) {
    case "invitation":
      return `/accept-invitation${fragment({ token: link.token })}`;
    case "invitationProof":
      return `/setup${fragment({ proof: link.token })}`;
    case "passwordReset":
      return `/reset-password${fragment({ token: link.token })}`;
    case "emailProof":
      return `/email-change${fragment({ token: link.token })}`;
    case "recoveryAcceptance":
      return `/recovery${fragment({ token: link.token })}`;
    case "recovery":
      return `/recovery${fragment({ case: link.caseId })}`;
  }
  // Signed out the side is unknown: come back to this same link after login (ids only, no secrets).
  if (state.status === "signedOut") return `/login?next=${encodeURIComponent(`/${window.location.hash}`)}`;
  return businessPath(link, state) ?? homeFor(state);
}

/** In-app path for an authenticated link, from the signed-in organization's side. */
function businessPath(link: Extract<ClientLink, { kind: "order" | "relationship" | "notification" }>, state: SessionState): string | null {
  if (state.status !== "business") return null;
  const side = state.organization.type === "VENDOR" ? "vendor" : "buyer";
  switch (link.kind) {
    case "order":
      return `/${side}/orders/${link.orderId}`;
    case "relationship":
      return side === "vendor" ? `/vendor/buyers/${link.relationshipId}` : `/buyer/vendors/${link.relationshipId}`;
    case "notification":
      return `/${side}/notifications`;
  }
}
