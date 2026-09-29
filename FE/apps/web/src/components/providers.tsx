"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { isServiceError } from "@repo/core";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { sessionStore } from "@/lib/session";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Retrying can't fix a missing implementation, a 404 or a validation error.
            retry: (count, error) =>
              count < 2 && !isServiceError(error, "NOT_IMPLEMENTED") && !isServiceError(error, "NOT_FOUND"),
          },
        },
      }),
  );

  useEffect(() => {
    void sessionStore.init();
    // Signing out must not leave the previous user's data in the cache.
    let wasSignedIn = false;
    return sessionStore.subscribe(() => {
      const signedIn = sessionStore.getState().status === "signedIn";
      if (wasSignedIn && !signedIn) queryClient.clear();
      wasSignedIn = signedIn;
    });
  }, [queryClient]);

  return (
    // Light is primary, dark fully supported (05 intro).
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
