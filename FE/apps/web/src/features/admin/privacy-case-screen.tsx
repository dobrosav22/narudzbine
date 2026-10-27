"use client";

import Link from "next/link";
import { ShieldIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDateTime, isApiError } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailList, IdText, PageHeader } from "./parts";
import { useAdminPrivacyCase } from "./queries";

/**
 * Safe privacy-case metadata (adminGetPrivacyCase; each read is audited). Review, holds,
 * export approval, redaction and dispositions are restricted, default-off operator operations
 * run through the assisted procedure (OPERATIONS_RUNBOOK / DESIGN_SPEC), not this console.
 */
export function AdminPrivacyCaseScreen({ caseId }: { caseId: string }) {
  const t = useTranslations("admin.privacy");
  const ta = useTranslations("admin");
  const privacy = useAdminPrivacyCase(caseId);

  if (privacy.isError) {
    return isApiError(privacy.error, "NOT_FOUND") ? (
      <EmptyState icon={ShieldIcon} title={t("notFound")}>
        <Button asChild variant="outline">
          <Link href="/admin/audit">{ta("audit.title")}</Link>
        </Button>
      </EmptyState>
    ) : (
      <ErrorState error={privacy.error} onRetry={() => void privacy.refetch()} />
    );
  }
  if (privacy.isPending) return <RowsSkeleton rows={5} />;
  const c = privacy.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t(`kind.${c.kind}`)}
        backHref="/admin/audit"
        backLabel={ta("audit.title")}
        badges={<Badge variant={c.state === "COMPLETED" ? "success" : c.state === "REJECTED" ? "destructive" : "info"}>{t(`state.${c.state}`)}</Badge>}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: t("caseId"), value: <IdText id={c.id} /> },
              {
                label: t("organization"),
                value: (
                  <Link href={`/admin/organizations/${c.organizationId}`} className="font-medium hover:underline">
                    {t("openOrganization")}
                  </Link>
                ),
              },
              { label: t("created"), value: formatDateTime(c.createdAt) },
            ]}
          />
        </CardContent>
      </Card>
      <Alert>
        <AlertDescription>{t("assisted")}</AlertDescription>
      </Alert>
    </div>
  );
}
