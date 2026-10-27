"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2Icon, ChevronDownIcon, PauseCircleIcon, PencilIcon, PlayCircleIcon, XOctagonIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatDate, formatDateTime, isApiError, type Organization, type OrganizationLifecycleAction } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGuarded } from "@/features/auth/reauth";
import { ConnectionsPanel } from "./connections-panel";
import { MembersPanel } from "./members-panel";
import { CorrectOrganizationDialog } from "./organization-correction";
import { CountryText, DetailList, IdText, OrgStateBadge, OrgTypeBadge, PageHeader, ReasonDialog } from "./parts";
import { useAdminOrganization, useChangeOrganizationState } from "./queries";
import { SupportPanel } from "./support-panel";
import { VendorPlanPanel } from "./vendor-plan-panel";

/**
 * One organization: administrative identity metadata, lifecycle (suspend/reactivate/close),
 * staff containment, vendor plan, direct connections and the reason-scoped support view.
 * Country, type, currency and owner are immutable here.
 */
export function AdminOrganizationDetailScreen({ organizationId }: { organizationId: string }) {
  const t = useTranslations("admin");
  const detail = useAdminOrganization(organizationId);
  const [correcting, setCorrecting] = useState(false);
  const [lifecycle, setLifecycle] = useState<OrganizationLifecycleAction | null>(null);

  if (detail.isError) {
    return isApiError(detail.error, "NOT_FOUND") ? (
      <EmptyState icon={Building2Icon} title={t("detail.notFound")}>
        <Button asChild variant="outline">
          <Link href="/admin/organizations">{t("organizations.title")}</Link>
        </Button>
      </EmptyState>
    ) : (
      <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
    );
  }
  if (detail.isPending) return <RowsSkeleton rows={8} />;
  const org = detail.data;
  const closed = org.state === "CLOSED";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={org.displayName}
        backHref="/admin/organizations"
        backLabel={t("organizations.title")}
        badges={
          <>
            <OrgTypeBadge type={org.type} />
            <OrgStateBadge state={org.state} />
          </>
        }
        description={
          <>
            {org.legalName} · <CountryText country={org.country} /> · {t("detail.since", { date: formatDate(org.createdAt) })}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setCorrecting(true)}>
              <PencilIcon data-icon="inline-start" />
              {t("detail.correct")}
            </Button>
            {!closed && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    {t("detail.lifecycle")}
                    <ChevronDownIcon data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {org.state === "ACTIVE" ? (
                    <DropdownMenuItem onSelect={() => setLifecycle("suspend")}>
                      <PauseCircleIcon />
                      {t("lifecycle.suspend.action")}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => setLifecycle("reactivate")}>
                      <PlayCircleIcon />
                      {t("lifecycle.reactivate.action")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem variant="destructive" onSelect={() => setLifecycle("close")}>
                    <XOctagonIcon />
                    {t("lifecycle.close.action")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {org.state !== "ACTIVE" && (
        <Alert>
          <AlertTitle>{t(`detail.stateNotice.${org.state}.title`)}</AlertTitle>
          <AlertDescription>{t(`detail.stateNotice.${org.state}.description`)}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">{t("detail.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="members">{t("detail.tabs.members")}</TabsTrigger>
          {org.type === "VENDOR" && <TabsTrigger value="plan">{t("detail.tabs.plan")}</TabsTrigger>}
          <TabsTrigger value="connections">{t("detail.tabs.connections")}</TabsTrigger>
          <TabsTrigger value="support">{t("detail.tabs.support")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewCard org={org} />
        </TabsContent>
        <TabsContent value="members">
          <MembersPanel org={org} />
        </TabsContent>
        {org.type === "VENDOR" && (
          <TabsContent value="plan">
            <VendorPlanPanel org={org} />
          </TabsContent>
        )}
        <TabsContent value="connections">
          <ConnectionsPanel org={org} />
        </TabsContent>
        <TabsContent value="support">
          <SupportPanel org={org} />
        </TabsContent>
      </Tabs>

      <CorrectOrganizationDialog org={org} open={correcting} onOpenChange={setCorrecting} />
      <LifecycleDialog org={org} action={lifecycle} onClose={() => setLifecycle(null)} />
    </div>
  );
}

function OverviewCard({ org }: { org: Organization }) {
  const t = useTranslations("admin");
  const a = org.registeredAddress;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("detail.identity")}</CardTitle>
        <CardDescription>{t("detail.identityDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailList
          items={[
            { label: t("detail.displayName"), value: org.displayName },
            { label: t("detail.legalName"), value: org.legalName },
            { label: t("detail.registration"), value: <span className="font-mono">{org.registrationIdentifier}</span> },
            { label: t("detail.tax"), value: org.taxIdentifier ? <span className="font-mono">{org.taxIdentifier}</span> : t("detail.none") },
            {
              label: t("detail.address"),
              value: (
                <>
                  {a.line1}
                  {a.line2 && (
                    <>
                      <br />
                      {a.line2}
                    </>
                  )}
                  <br />
                  {a.postalCode} {a.city}, <CountryText country={a.country} />
                </>
              ),
            },
            { label: t("detail.currency"), value: org.currency },
            { label: t("detail.language"), value: t(`locale.${org.defaultLanguage}`) },
            ...(org.type === "BUYER"
              ? [{ label: t("detail.staffRestricted"), value: org.staffSubmissionRestricted ? t("detail.yes") : t("detail.no") }]
              : []),
            { label: t("detail.partnerContact"), value: org.partnerContactId ? t("detail.partnerContactShared") : t("detail.partnerContactNone") },
            { label: t("detail.owner"), value: <IdText id={org.ownerAccountId} /> },
            { label: t("detail.id"), value: <IdText id={org.id} /> },
            { label: t("detail.updated"), value: formatDateTime(org.updatedAt) },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function LifecycleDialog({ org, action, onClose }: { org: Organization; action: OrganizationLifecycleAction | null; onClose: () => void }) {
  const t = useTranslations("admin");
  const change = useChangeOrganizationState();
  const guarded = useGuarded();
  const detail = useAdminOrganization(org.id);

  async function confirm(reason: string) {
    if (!action) return;
    try {
      const updated = await guarded(() =>
        change.mutateAsync({ organizationId: org.id, action, body: { expectedRevision: org.revision, reason } }),
      );
      toast.success(t(`lifecycle.${action}.done`, { name: updated.displayName }));
      change.reset();
      onClose();
    } catch (e) {
      // A stale revision: reload so the operator can review the current state and confirm again.
      if (isApiError(e, "REVISION_CONFLICT")) void detail.refetch();
    }
  }

  return (
    <ReasonDialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) {
          change.reset();
          onClose();
        }
      }}
      title={action ? t(`lifecycle.${action}.title`, { name: org.displayName }) : ""}
      description={action ? t(`lifecycle.${action}.description`) : undefined}
      confirmLabel={action ? t(`lifecycle.${action}.action`) : ""}
      destructive={action === "close" || action === "suspend"}
      confirmText={action === "close" ? org.displayName : undefined}
      pending={change.isPending}
      error={change.error}
      errorMessages={{ NONTERMINAL_ORDERS: t("lifecycle.close.openOrders"), ORGANIZATION_CLOSED: t("lifecycle.alreadyClosed") }}
      onConfirm={(reason) => void confirm(reason)}
    />
  );
}
