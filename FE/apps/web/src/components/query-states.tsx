"use client";

import { AlertCircleIcon, PlugZapIcon, RotateCcwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { isServiceError } from "@repo/core";
import { useErrorText } from "@/lib/i18n";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Error state for any failed service call. NOT_IMPLEMENTED (USE_MOCKS=false
 * with no real service yet) is called out explicitly so it can't be mistaken
 * for a transient failure.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTranslations("states");
  const errorText = useErrorText();
  const notImplemented = isServiceError(error, "NOT_IMPLEMENTED");
  const message = errorText(error);
  return (
    <Alert variant="destructive">
      {notImplemented ? <PlugZapIcon /> : <AlertCircleIcon />}
      <AlertTitle>{notImplemented ? t("backendNotConnected") : t("somethingWentWrong")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{message}</p>
        {onRetry && !notImplemented && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcwIcon data-icon="inline-start" />
            {t("tryAgain")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}

export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  const t = useTranslations("states");
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("loading")}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
