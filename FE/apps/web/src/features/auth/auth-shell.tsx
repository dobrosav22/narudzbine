"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSession } from "@/lib/session";
import { GuestLanguageSelect } from "./guest-language-select";

/** Frame for the public pages (login, password reset, invitations): wordmark, centred card, language and theme. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const state = useSession();
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center gap-3 px-4">
        <Link href="/" className="font-semibold tracking-tight text-primary">
          Narudžbine
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {state.status === "signedOut" && <GuestLanguageSelect className="h-8 w-32" />}
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
