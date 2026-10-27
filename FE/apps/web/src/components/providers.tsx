"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { QUERY_DEFAULTS } from "@repo/core";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReauthProvider } from "@/features/auth/reauth";
import { I18nProvider } from "@/lib/i18n";
import { sessionStore } from "@/lib/session";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: QUERY_DEFAULTS }));

  useEffect(() => {
    void sessionStore.init();
    // Signing out (or a revoked session) must not leave the previous person's data in the cache.
    let wasSignedIn = false;
    return sessionStore.subscribe(() => {
      const status = sessionStore.getState().status;
      const signedIn = status === "business" || status === "admin";
      if (wasSignedIn && !signedIn) queryClient.clear();
      wasSignedIn = signedIn;
    });
  }, [queryClient]);

  return (
    // Light is primary, dark fully supported.
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <TooltipProvider>
            <ReauthProvider>{children}</ReauthProvider>
            <Toaster />
          </TooltipProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
