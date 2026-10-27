"use client";

import { useState } from "react";
import { CheckIcon, ClockIcon, InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  formatDate,
  formatNumber,
  isApiError,
  isOrgAdmin,
  pendingPlanRequest,
  planChangeWarnings,
  planNameMsg,
  planUsage,
  type PlanLimitKind,
  type PlanRequest,
  type PlanRevision,
  type VendorPlan,
} from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProblemAlert } from "@/features/trading/parts";
import { useErrorText, useMsg } from "@/lib/i18n";
import { useBusiness } from "@/lib/session";
import { useAvailablePlans, usePlanRequests, useRequestPlanChange, useVendorPlan, useWithdrawPlanRequest } from "./queries";

const REQUEST_BADGE: Record<PlanRequest["state"], "info" | "success" | "secondary" | "destructive"> = {
  PENDING: "info",
  APPROVED: "success",
  REJECTED: "destructive",
  WITHDRAWN: "secondary",
  SUPERSEDED: "secondary",
};

/**
 * Vendor → Settings → Plan: the current plan's limits and usage, the available plans, and plan
 * change requests (owner/admin). A platform admin approves or rejects requests; there is no
 * billing or price in the application.
 */
export function PlanScreen() {
  const t = useTranslations("plan");
  const tm = useMsg();
  const session = useBusiness();
  const admin = isOrgAdmin(session);
  const plan = useVendorPlan();
  const plans = useAvailablePlans(true);
  const requests = usePlanRequests(admin);
  const [target, setTarget] = useState<PlanRevision | null>(null);

  const retry = () => void Promise.all([plan.refetch(), plans.refetch(), admin ? requests.refetch() : undefined]);
  if (plan.isError) {
    return isApiError(plan.error, "PLAN_REQUIRED") ? (
      <Alert>
        <InfoIcon />
        <AlertTitle>{t("noPlanTitle")}</AlertTitle>
        <AlertDescription>{t("noPlanDescription")}</AlertDescription>
      </Alert>
    ) : (
      <ErrorState error={plan.error} onRetry={retry} />
    );
  }
  if (plans.isError) return <ErrorState error={plans.error} onRetry={retry} />;
  if (plan.isPending || plans.isPending || (admin && requests.isPending)) return <RowsSkeleton rows={4} />;

  const current = plan.data;
  const byId = new Map(plans.data.map((p) => [p.id, p]));
  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p ? tm(planNameMsg(p)) : "—";
  };
  const pending = pendingPlanRequest(requests.data);
  const offered = plans.data.filter((p) => !p.retired || p.id === current.plan.id);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t("currentTitle", { plan: tm(planNameMsg(current.plan)) })}
            {current.plan.retired && <Badge variant="secondary">{t("retired")}</Badge>}
          </CardTitle>
          <CardDescription>{t("currentDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <Meter plan={current} kind="products" />
          <Meter plan={current} kind="buyers" />
        </CardContent>
      </Card>

      {pending && <PendingRequest request={pending} planName={nameOf(pending.requestedPlanRevisionId)} />}

      <div className="grid gap-4 md:grid-cols-3" role="list" aria-label={t("plans")}>
        {offered.map((p) => {
          const isCurrent = p.id === current.plan.id;
          return (
            <Card key={p.id} role="listitem" aria-label={tm(planNameMsg(p))}>
              <CardHeader>
                <CardTitle>{tm(planNameMsg(p))}</CardTitle>
                {isCurrent && (
                  <CardAction>
                    <Badge variant="secondary">{t("current")}</Badge>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <CheckIcon className="text-muted-foreground" />
                  {t("limitProductsShort", { count: p.productLimit, countText: formatNumber(p.productLimit) })}
                </span>
                <span className="flex items-center gap-2">
                  <CheckIcon className="text-muted-foreground" />
                  {t("limitBuyersShort", { count: p.activeBuyerLimit, countText: formatNumber(p.activeBuyerLimit) })}
                </span>
              </CardContent>
              {admin && !isCurrent && !p.retired && (
                <CardFooter>
                  <Button className="w-full" variant="outline" disabled={!!pending} onClick={() => setTarget(p)}>
                    {t("request", { plan: tm(planNameMsg(p)) })}
                  </Button>
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>

      {admin ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("requests")}</CardTitle>
            <CardDescription>{t("requestsDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {(requests.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noRequests")}</p>
            ) : (
              <Table className="text-sm" aria-label={t("requests")}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("requested")}</TableHead>
                    <TableHead>{t("sent")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("reason")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.data!.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{nameOf(r.requestedPlanRevisionId)}</TableCell>
                      <TableCell>{formatDate(r.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={REQUEST_BADGE[r.state]}>{t(`requestState.${r.state}`)}</Badge>
                          {r.state !== "PENDING" && <span className="text-xs text-muted-foreground">{formatDate(r.updatedAt)}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell whitespace-normal text-muted-foreground">{r.resolutionReason ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">{t("staffNote")}</p>
      )}

      <Alert>
        <InfoIcon />
        <AlertTitle>{t("billingTitle")}</AlertTitle>
        <AlertDescription>{t("billingDescription")}</AlertDescription>
      </Alert>

      <RequestDialog plan={current} target={target} targetName={target ? tm(planNameMsg(target)) : ""} onClose={() => setTarget(null)} />
    </div>
  );
}

function PendingRequest({ request, planName }: { request: PlanRequest; planName: string }) {
  const t = useTranslations("plan");
  const errorText = useErrorText();
  const withdraw = useWithdrawPlanRequest();
  return (
    <Alert>
      <ClockIcon />
      <AlertTitle>{t("pendingTitle", { plan: planName })}</AlertTitle>
      <AlertDescription>{t("pendingDescription", { date: formatDate(request.createdAt) })}</AlertDescription>
      <AlertAction>
        <Button
          size="sm"
          variant="outline"
          disabled={withdraw.isPending}
          onClick={() =>
            withdraw.mutate(
              { requestId: request.id, expectedRevision: request.revision },
              { onSuccess: () => toast.success(t("withdrawn")), onError: (e) => toast.error(errorText(e)) },
            )
          }
        >
          {withdraw.isPending && <Spinner data-icon="inline-start" />}
          {t("withdraw")}
        </Button>
      </AlertAction>
    </Alert>
  );
}

function RequestDialog({ plan, target, targetName, onClose }: { plan: VendorPlan; target: PlanRevision | null; targetName: string; onClose: () => void }) {
  const t = useTranslations("plan");
  const tc = useTranslations("common");
  const tm = useMsg();
  const request = useRequestPlanChange();
  const close = () => {
    request.reset();
    onClose();
  };
  const warnings = target ? planChangeWarnings(plan, target) : [];

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle", { plan: targetName })}</DialogTitle>
          <DialogDescription>
            {target &&
              t("dialogDescription", {
                products: formatNumber(target.productLimit),
                buyers: formatNumber(target.activeBuyerLimit),
              })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {warnings.length > 0 && (
            <Alert>
              <AlertTitle>{t("overTitle")}</AlertTitle>
              <AlertDescription>{[...warnings.map(tm), t("overNote")].join(" ")}</AlertDescription>
            </Alert>
          )}
          {request.error && <ProblemAlert error={request.error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {tc("cancel")}
          </Button>
          <Button
            disabled={request.isPending || !target}
            onClick={() =>
              target &&
              request.mutate(target.id, {
                onSuccess: () => {
                  toast.success(t("requestSent", { plan: targetName }));
                  close();
                },
              })
            }
          >
            {request.isPending && <Spinner data-icon="inline-start" />}
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Meter({ plan, kind }: { plan: VendorPlan; kind: PlanLimitKind }) {
  const t = useTranslations("plan");
  const { used, limit } = planUsage(plan, kind);
  const label = kind === "products" ? t("products") : t("buyers");
  const share = limit > 0 ? Math.min(1, used / limit) : 1;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono tabular-nums">
          {formatNumber(used)} / {formatNumber(limit)}
        </span>
      </div>
      <Progress value={share * 100} aria-label={t("meterAria", { label, used: formatNumber(used), max: formatNumber(limit) })} />
      <span className="text-xs text-muted-foreground">
        {used > limit ? t("overLimit") : used >= limit ? t("limitReached") : t("left", { count: limit - used, countText: formatNumber(limit - used) })}
      </span>
      {kind === "buyers" && <span className="text-xs text-muted-foreground">{t("buyersNote")}</span>}
    </div>
  );
}
