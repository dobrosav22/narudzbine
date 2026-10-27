"use client";

import { useState } from "react";
import { MailPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDateTime, formatNumber, type AdminCountrySummary } from "@repo/core";
import { ErrorState } from "@/components/query-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CountryText, PageHeader, StatTile } from "./parts";
import { useAdminSummary } from "./queries";
import { InviteOrganizationDialog } from "./setup-invitations";

type Metric = Exclude<keyof AdminCountrySummary, "country">;
const METRICS: Metric[] = ["activeVendors", "activeBuyers", "activeBusinessUsers", "activeConnections", "pendingPlanRequests"];

/**
 * Operational summary (adminGetSummary): exactly RS then BA from one database snapshot.
 * Counts only — no money or sales figures exist on the platform level.
 */
export function AdminDashboardScreen() {
  const t = useTranslations("admin");
  const summary = useAdminSummary();
  const [inviting, setInviting] = useState(false);

  const total = (m: Metric) => summary.data?.countries.reduce((sum, c) => sum + c[m], 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("dashboard.title")}
        description={summary.data ? t("dashboard.asOf", { time: formatDateTime(summary.data.asOf) }) : t("dashboard.subtitle")}
        actions={
          <Button onClick={() => setInviting(true)}>
            <MailPlusIcon data-icon="inline-start" />
            {t("invite.open")}
          </Button>
        }
      />

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-busy="true" aria-label={t("loading")}>
          {METRICS.map((m) => (
            <Skeleton key={m} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile label={t("dashboard.metric.activeVendors")} value={total("activeVendors")} footer={t("dashboard.allOrganizations")} href="/admin/organizations" />
            <StatTile label={t("dashboard.metric.activeBuyers")} value={total("activeBuyers")} footer={t("dashboard.allOrganizations")} href="/admin/organizations" />
            <StatTile label={t("dashboard.metric.activeBusinessUsers")} value={total("activeBusinessUsers")} />
            <StatTile label={t("dashboard.metric.activeConnections")} value={total("activeConnections")} />
            <StatTile
              label={t("dashboard.metric.pendingPlanRequests")}
              value={total("pendingPlanRequests")}
              footer={t("dashboard.reviewRequests")}
              href="/admin/plan-requests"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.byCountry")}</CardTitle>
              <CardDescription>{t("dashboard.byCountryDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table className="text-sm" aria-label={t("dashboard.byCountry")}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dashboard.metricColumn")}</TableHead>
                    {summary.data.countries.map((c) => (
                      <TableHead key={c.country} className="text-right">
                        <CountryText country={c.country} />
                      </TableHead>
                    ))}
                    <TableHead className="text-right">{t("dashboard.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {METRICS.map((m) => (
                    <TableRow key={m}>
                      <TableCell>{t(`dashboard.metric.${m}`)}</TableCell>
                      {summary.data.countries.map((c) => (
                        <TableCell key={c.country} className="text-right font-mono tabular-nums">
                          {formatNumber(c[m])}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-mono font-medium tabular-nums">{formatNumber(total(m))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="pt-3 text-xs text-muted-foreground">{t("dashboard.definitions")}</p>
            </CardContent>
          </Card>
        </>
      )}

      <InviteOrganizationDialog open={inviting} onOpenChange={setInviting} />
    </div>
  );
}
