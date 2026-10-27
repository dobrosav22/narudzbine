"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatNumber, isApiError, planOverages, sortPlans, type Organization, type PlanRevision, type VendorPlan } from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGuarded } from "@/features/auth/reauth";
import { ReasonDialog } from "./parts";
import { usePlanText } from "./plan-label";
import { useAdminPlans, useAdminVendorPlan, useAssignPlan } from "./queries";

/**
 * Vendor plan management (adminGetVendorPlan / adminAssignPlan): current assignment with actual
 * counted usage, and a direct reasoned change. A real change supersedes any pending request.
 * Plans are entitlements only; there is no price.
 */
export function VendorPlanPanel({ org }: { org: Organization }) {
  const t = useTranslations("admin.vendorPlan");
  const closed = org.state === "CLOSED";
  const plan = useAdminVendorPlan(org.id, !closed);
  const plans = useAdminPlans();

  if (closed) {
    return (
      <Alert>
        <AlertDescription>{t("closed")}</AlertDescription>
      </Alert>
    );
  }
  if (plan.isError) {
    return isApiError(plan.error, "PLAN_REQUIRED") ? (
      <Alert>
        <AlertTitle>{t("noPlanTitle")}</AlertTitle>
        <AlertDescription>{t("noPlanDescription")}</AlertDescription>
      </Alert>
    ) : (
      <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
    );
  }
  if (plans.isError) return <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />;
  if (plan.isPending || plans.isPending) return <RowsSkeleton rows={4} />;
  return <PlanCards org={org} current={plan.data} plans={plans.data} onStale={() => void plan.refetch()} />;
}

function PlanCards({ org, current, plans, onStale }: { org: Organization; current: VendorPlan; plans: PlanRevision[]; onStale: () => void }) {
  const t = useTranslations("admin.vendorPlan");
  const planText = usePlanText();
  const assign = useAssignPlan();
  const guarded = useGuarded();
  const [picked, setPicked] = useState("");
  const [confirming, setConfirming] = useState(false);
  const options = sortPlans(plans).filter((p) => !p.retired && p.id !== current.plan.id);
  const target = options.find((p) => p.id === picked);
  const overages = target ? planOverages(target, current) : [];

  async function confirm(reason: string) {
    if (!target) return;
    try {
      await guarded(() => assign.mutateAsync({ vendorId: org.id, body: { expectedRevision: current.revision, planRevisionId: target.id, reason } }));
      toast.success(t("assigned", { plan: planText.name(target) }));
      assign.reset();
      setConfirming(false);
      setPicked("");
    } catch (e) {
      if (isApiError(e, "REVISION_CONFLICT")) onStale();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {planText.name(current.plan)}
            {current.plan.retired && <Badge variant="secondary">{t("retiredPinned")}</Badge>}
          </CardTitle>
          <CardDescription>{planText.limits(current.plan)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Usage label={t("products")} used={current.nonArchivedProductCount} limit={current.plan.productLimit} />
          <Usage label={t("buyers")} used={current.activeBuyerCount} limit={current.plan.activeBuyerLimit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("changeTitle")}</CardTitle>
          <CardDescription>
            {t("changeDescription")}{" "}
            <Link href="/admin/plan-requests" className="underline hover:text-foreground">
              {t("requestsLink")}
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="admin-assign-plan">{t("newPlan")}</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Select value={picked} onValueChange={setPicked}>
                <SelectTrigger id="admin-assign-plan" className="w-full sm:w-80">
                  <SelectValue placeholder={t("choosePlan")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {options.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {planText.name(p)} — {planText.limits(p)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button variant="outline" disabled={!target} onClick={() => setConfirming(true)}>
                {t("assign")}
              </Button>
            </div>
          </Field>
          {overages.length > 0 && (
            <Alert>
              <AlertTitle>{t("wouldExceed")}</AlertTitle>
              <AlertDescription>{overages.map((o) => t(`over.${o}`)).join(" ")}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <ReasonDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) assign.reset();
        }}
        title={t("confirmTitle", { vendor: org.displayName, plan: target ? planText.name(target) : "" })}
        description={t("confirmDescription")}
        confirmLabel={t("assign")}
        pending={assign.isPending}
        error={assign.error}
        errorMessages={{ PLAN_LIMIT_EXCEEDED: t("limitExceeded"), REVISION_CONFLICT: t("stale") }}
        onConfirm={(reason) => void confirm(reason)}
      />
    </div>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const t = useTranslations("admin.vendorPlan");
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="flex items-center gap-2 font-mono tabular-nums">
          {formatNumber(used)} / {formatNumber(limit)}
          {used > limit ? <Badge variant="destructive">{t("overLimit")}</Badge> : used >= limit ? <Badge variant="warning">{t("atLimit")}</Badge> : null}
        </span>
      </div>
      <Progress value={pct} aria-label={t("usageAria", { label, used: formatNumber(used), limit: formatNumber(limit) })} />
    </div>
  );
}
