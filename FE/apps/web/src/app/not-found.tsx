"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CompassIcon } from "lucide-react";
import { EmptyState } from "@/components/query-states";
import { Button } from "@/components/ui/button";

/** Unknown URLs: a translated page in the app's style with a way back, instead of Next's default. */
export default function NotFound() {
  const t = useTranslations("common");
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <EmptyState icon={CompassIcon} title={t("notFoundTitle")} description={t("notFoundDescription")}>
        <Button asChild>
          <Link href="/">{t("notFoundHome")}</Link>
        </Button>
      </EmptyState>
    </main>
  );
}
