"use client";

import { useState } from "react";
import Link from "next/link";
import { InboxIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatDate, isApiError, PLAN_REQUEST_STATES, planOverages, type PlanRequest, type PlanRevision } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGuarded } from "@/features/auth/reauth";
import { FilterSelect, PageHeader, Pager, ReasonDialog } from "./parts";
import { usePlanText } from "./plan-label";
import { useAdminOrganizationNames, useAdminPlanRequests, useAdminPlans, useAdminVendorPlan, useResolvePlanRequest } from "./queries";

const PAGE_SIZE = 25;
type RequestState = (typeof PLAN_REQUEST_STATES)[number];
const STATE_BADGE: Record<RequestState, "info" | "success" | "destructive" | "secondary"> = {
  PENDING: "info",
  APPROVED: "success",
  REJECTED: "destructive",
  WITHDRAWN: "secondary",
  SUPERSEDED: "secondary",
};

/**
 * Vendor plan-change queue (adminListPlanRequests). Approval applies the requested plan at once
 * after the backend rechecks current usage; rejection needs a reason. Both reasons are shown to
 * the vendor.
 */
export function AdminPlanRequestsScreen() {
  const t = useTranslations("admin.planRequests");
  const ta = useTranslations("admin");
  const planText = usePlanText();
  const [state, setState] = useState<RequestState | "">("PENDING");
  const [page, setPage] = useState(0);
  const [acting, setActing] = useState<{ request: PlanRequest; approve: boolean } | null>(null);
  const requests = useAdminPlanRequests({ page, size: PAGE_SIZE, includeTotal: true, ...(state ? { state } : {}) });
  const plans = useAdminPlans();
  const vendors = useAdminOrganizationNames(requests.data?.items.map((r) => r.vendorId) ?? []);
  const planById = new Map((plans.data ?? []).map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <FilterSelect
        label={t("state")}
        value={state}
        onChange={(v) => {
          setState(v);
          setPage(0);
        }}
        options={PLAN_REQUEST_STATES.map((s) => ({ value: s, label: t(`stateName.${s}`) }))}
        allLabel={t("allStates")}
        className="w-48"
      />
      {requests.isError ? (
        <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
      ) : requests.isPending ? (
        <RowsSkeleton rows={4} />
      ) : requests.data.items.length === 0 ? (
        <EmptyState icon={InboxIcon} title={state === "PENDING" ? t("nonePending") : t("none")} description={state === "PENDING" ? t("nonePendingDescription") : undefined} />
      ) : (
        <Card>
          <CardContent>
            <Table className="text-sm" aria-label={t("title")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("vendor")}</TableHead>
                  <TableHead>{t("requested")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("current")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("sent")}</TableHead>
                  <TableHead className="text-right">{t("state")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.data.items.map((r) => {
                  const requested = planById.get(r.requestedPlanRevisionId);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/admin/organizations/${r.vendorId}`} className="font-medium hover:underline">
                          {vendors.get(r.vendorId)?.displayName ?? ta("organizationFallback")}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {requested ? (
                          <>
                            <div className="font-medium">{planText.name(requested)}</div>
                            <div className="text-xs text-muted-foreground">{planText.limits(requested)}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell whitespace-normal">
                        {r.state === "PENDING" ? <CurrentPlan vendorId={r.vendorId} requested={requested} /> : "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{formatDate(r.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {r.state === "PENDING" ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button size="sm" onClick={() => setActing({ request: r, approve: true })}>
                              {t("approve")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setActing({ request: r, approve: false })}>
                              {t("reject")}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant={STATE_BADGE[r.state]}>{t(`stateName.${r.state}`)}</Badge>
                            <span className="text-xs text-muted-foreground">{formatDate(r.updatedAt)}</span>
                            {r.resolutionReason && <span className="max-w-64 text-xs whitespace-normal text-muted-foreground">{r.resolutionReason}</span>}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pager page={page} size={PAGE_SIZE} total={requests.data.total} count={requests.data.items.length} onPage={setPage} />
          </CardContent>
        </Card>
      )}
      <ResolveDialog
        acting={acting}
        vendorName={acting ? (vendors.get(acting.request.vendorId)?.displayName ?? "") : ""}
        plan={acting ? planById.get(acting.request.requestedPlanRevisionId) : undefined}
        onClose={() => setActing(null)}
        onStale={() => void requests.refetch()}
      />
    </div>
  );
}

/** The vendor's current plan and usage, with a warning when the requested plan would not fit. */
function CurrentPlan({ vendorId, requested }: { vendorId: string; requested: PlanRevision | undefined }) {
  const t = useTranslations("admin.planRequests");
  const planText = usePlanText();
  const current = useAdminVendorPlan(vendorId);
  if (current.isPending) return <span className="text-muted-foreground">…</span>;
  if (current.isError) return <span className="text-muted-foreground">—</span>;
  const overages = requested ? planOverages(requested, current.data) : [];
  return (
    <div className="flex flex-col gap-1">
      <span>{planText.name(current.data.plan)}</span>
      <span className="text-xs text-muted-foreground">
        {t("usage", { products: current.data.nonArchivedProductCount, buyers: current.data.activeBuyerCount })}
      </span>
      {overages.length > 0 && <Badge variant="warning">{t("wouldNotFit")}</Badge>}
    </div>
  );
}

function ResolveDialog({
  acting,
  vendorName,
  plan,
  onClose,
  onStale,
}: {
  acting: { request: PlanRequest; approve: boolean } | null;
  vendorName: string;
  plan: PlanRevision | undefined;
  onClose: () => void;
  onStale: () => void;
}) {
  const t = useTranslations("admin.planRequests");
  const planText = usePlanText();
  const resolve = useResolvePlanRequest();
  const guarded = useGuarded();
  const planName = plan ? planText.name(plan) : "";

  async function confirm(reason: string) {
    if (!acting) return;
    try {
      await guarded(() => resolve.mutateAsync({ requestId: acting.request.id, approve: acting.approve, body: { expectedRevision: acting.request.revision, reason } }));
      toast.success(acting.approve ? t("approved", { vendor: vendorName, plan: planName }) : t("rejected"));
      resolve.reset();
      onClose();
    } catch (e) {
      if (isApiError(e, "REVISION_CONFLICT") || isApiError(e, "INVALID_STATE")) onStale();
    }
  }

  return (
    <ReasonDialog
      open={acting !== null}
      onOpenChange={(open) => {
        if (!open) {
          resolve.reset();
          onClose();
        }
      }}
      title={acting?.approve ? t("approveTitle", { vendor: vendorName, plan: planName }) : t("rejectTitle", { vendor: vendorName, plan: planName })}
      description={acting?.approve ? t("approveDescription") : t("rejectDescription")}
      reasonLabel={t("vendorMessage")}
      reasonHint={t("vendorMessageHint")}
      confirmLabel={acting?.approve ? t("approve") : t("reject")}
      destructive={!acting?.approve}
      pending={resolve.isPending}
      error={resolve.error}
      errorMessages={{ PLAN_LIMIT_EXCEEDED: t("limitExceeded"), INVALID_STATE: t("alreadyResolved"), REVISION_CONFLICT: t("stale") }}
      onConfirm={(reason) => void confirm(reason)}
    >
      {acting?.approve && plan && (
        <Alert>
          <AlertTitle>{planName}</AlertTitle>
          <AlertDescription>{planText.limits(plan)}</AlertDescription>
        </Alert>
      )}
    </ReasonDialog>
  );
}
