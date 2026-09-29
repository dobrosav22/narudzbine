"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FullPageSpinner } from "@/features/shell/guards";
import { homeFor, useSession } from "@/lib/session";

/** Entry point: send people to login or to their role's home. */
export default function Home() {
  const state = useSession();
  const router = useRouter();
  useEffect(() => {
    if (state.status !== "loading") router.replace(homeFor(state));
  }, [state, router]);
  return <FullPageSpinner />;
}
