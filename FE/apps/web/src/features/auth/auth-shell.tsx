"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { USE_MOCKS } from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { LanguageSelect } from "@/components/language-select";
import { ThemeToggle } from "@/components/theme-toggle";

/** Frame for login / register / invite: wordmark, centred card, language and theme. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center gap-3 px-4">
        <Link href="/" className="font-semibold tracking-tight text-primary">
          Narudžbine
        </Link>
        {USE_MOCKS && <Badge variant="outline">{t("mockData")}</Badge>}
        <div className="ml-auto flex items-center gap-2">
          <LanguageSelect className="h-8 w-32" />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
