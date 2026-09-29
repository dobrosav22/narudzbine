"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ClockIcon } from "lucide-react";
import { toast } from "sonner";
import {
  formatDate,
  formatMoney,
  formatNumber,
  pendingRequest,
  planChangeProblems,
  services,
  UPGRADE_REQUEST_STATUS_KEY,
  usageShare,
  type SubscriptionTier,
  type TierUpgradeRequest,
  type VendorPlan,
} from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/features/auth/form-error";
import { useVendorPlan } from "@/features/vendor-catalogue/queries";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

const REQUEST_BADGE: Record<TierUpgradeRequest["status"], "info" | "success" | "secondary"> = {
  pending: "info",
  fulfilled: "success",
  dismissed: "secondary",
};

/** Under the ["subscription", id] prefix, so a request or an admin change refreshes usage and history together. */
function useUpgradeRequests(vendorOrgId: string) {
  return useQuery({
    queryKey: ["subscription", vendorOrgId, "requests"],
    queryFn: () => services.subscription.listUpgradeRequests(vendorOrgId),
  });
}

/**
 * 03 v1.1 → "Subscription & billing": current tier, usage vs. limits (getUsage), and a
 * request-upgrade action (tier + optional note). No self-serve tier change — only the
 * Platform Admin applies tiers (01 §2). Shows this vendor's own request history.
 */
export function PlanPanel({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useTranslations("settings.plan");
  const tp = useTranslations("planText");
  const tm = useMsg();
  const plan = useVendorPlan(vendorOrgId);
  const tiers = useQuery({ queryKey: ["subscriptionTiers"], queryFn: () => services.subscription.listTiers() });
  const requests = useUpgradeRequests(vendorOrgId);
  const [target, setTarget] = useState<SubscriptionTier | null>(null);

  const retry = () => void Promise.all([plan.refetch(), tiers.refetch(), requests.refetch()]);
  if (plan.isError) return <ErrorState error={plan.error} onRetry={retry} />;
  if (tiers.isError) return <ErrorState error={tiers.error} onRetry={retry} />;
  if (requests.isError) return <ErrorState error={requests.error} onRetry={retry} />;
  if (plan.isPending || tiers.isPending || requests.isPending) return <RowsSkeleton rows={4} />;
  const p = plan.data;
  const pending = pendingRequest(requests.data);
  const tierName = (id: string | undefined) => tiers.data.find((tier) => tier.id === id)?.name ?? "—";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("planName", { plan: p.tier.name })}</CardTitle>
          <CardDescription>{t("perMonth", { price: formatMoney(p.tier.priceMonthly) })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <Meter label={t("products")} used={p.productCount} max={p.maxProducts} />
          <Meter label={t("buyers")} used={p.buyerCount} max={p.maxBuyers} hint={t("pendingCount")} />
        </CardContent>
      </Card>

      {pending && (
        <Alert>
          <ClockIcon />
          <AlertTitle>{t("pendingTitle", { plan: tierName(pending.requestedTierId) })}</AlertTitle>
          <AlertDescription>{t("pendingDescription", { date: formatDate(pending.createdAt) })}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3" role="list" aria-label={t("plans")}>
        {tiers.data.map((tier) => {
          const current = tier.id === p.tier.id;
          const upgrade = tier.priceMonthly > p.tier.priceMonthly;
          return (
            <Card key={tier.id} role="listitem" aria-label={t("planName", { plan: tier.name })}>
              <CardHeader>
                <CardTitle>{tier.name}</CardTitle>
                <CardDescription className="font-mono tabular-nums">{tp("price", { price: formatMoney(tier.priceMonthly) })}</CardDescription>
                {current && (
                  <CardAction>
                    <Badge variant="secondary">{t("current")}</Badge>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <CheckIcon className="text-muted-foreground" />
                  {tp("limitProducts", { count: formatNumber(tier.maxProducts) })}
                </span>
                <span className="flex items-center gap-2">
                  <CheckIcon className="text-muted-foreground" />
                  {tp("limitBuyers", { count: formatNumber(tier.maxBuyers) })}
                </span>
              </CardContent>
              {!current && (
                <CardFooter>
                  <Button className="w-full" variant={upgrade ? "default" : "outline"} disabled={!!pending} onClick={() => setTarget(tier)}>
                    {t("request", { plan: tier.name })}
                  </Button>
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("requests")}</CardTitle>
          <CardDescription>{t("requestsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {requests.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRequests")}</p>
          ) : (
            <Table className="text-sm" aria-label={t("requests")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("requested")}</TableHead>
                  <TableHead>{t("sent")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("note")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{tierName(r.requestedTierId)}</TableCell>
                    <TableCell>{formatDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={REQUEST_BADGE[r.status]}>{tm({ key: UPGRADE_REQUEST_STATUS_KEY[r.status] })}</Badge>
                        {r.resolvedAt && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(r.resolvedAt)}
                            {r.appliedTierId && r.appliedTierId !== r.requestedTierId && ` · ${t("movedTo", { plan: tierName(r.appliedTierId) })}`}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell whitespace-normal text-muted-foreground">{r.message ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* [assumed] The contract has no invoices or payment methods; 01 §2 calls the request flow a placeholder for real billing. */}
      <Alert>
        <AlertTitle>{t("billing")}</AlertTitle>
        <AlertDescription>{t("billingDescription")}</AlertDescription>
      </Alert>

      <RequestDialog vendorOrgId={vendorOrgId} plan={p} tier={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function RequestDialog({
  vendorOrgId,
  plan,
  tier,
  onClose,
}: {
  vendorOrgId: string;
  plan: VendorPlan;
  tier: SubscriptionTier | null;
  onClose: () => void;
}) {
  const t = useTranslations("settings.plan");
  const tc = useTranslations("common");
  const tm = useMsg();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const request = useMutation({
    mutationFn: (tier: SubscriptionTier) => services.subscription.requestUpgrade({ vendorOrgId, requestedTierId: tier.id, message: note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription", vendorOrgId] }),
  });
  const close = () => {
    setNote("");
    request.reset();
    onClose();
  };
  // Asking for a smaller plan than current usage is allowed, but worth saying out loud.
  const warnings = tier ? planChangeProblems(plan, tier) : [];

  return (
    <Dialog open={tier !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle", { plan: tier?.name ?? "" })}</DialogTitle>
          <DialogDescription>
            {tier &&
              t("dialogDescription", { price: formatMoney(tier.priceMonthly), products: formatNumber(tier.maxProducts), buyers: formatNumber(tier.maxBuyers) })}
          </DialogDescription>
        </DialogHeader>
        <form
          id="upgrade-request-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tier) return;
            request.mutate(tier, {
              onSuccess: () => {
                toast.success(t("requestSent", { plan: tier.name }));
                close();
              },
            });
          }}
        >
          <FieldGroup>
            {warnings.length > 0 && (
              <Alert>
                <AlertTitle>{t("overTitle")}</AlertTitle>
                <AlertDescription>{[...warnings.map(tm), t("overNote")].join(" ")}</AlertDescription>
              </Alert>
            )}
            {request.error && <FormError error={request.error} />}
            <Field>
              <FieldLabel htmlFor="upgrade-note">{t("noteLabel")}</FieldLabel>
              <Textarea id="upgrade-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              <FieldDescription>{t("noteHint")}</FieldDescription>
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="upgrade-request-form" disabled={request.isPending}>
            {request.isPending && <Spinner data-icon="inline-start" />}
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Meter({ label, used, max, hint }: { label: string; used: number; max: number; hint?: string }) {
  const t = useTranslations("settings.plan");
  const share = usageShare(used, max);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono tabular-nums">
          {formatNumber(used)} / {formatNumber(max)}
        </span>
      </div>
      <Progress value={share * 100} aria-label={t("meterAria", { label, used: formatNumber(used), max: formatNumber(max) })} />
      <span className="text-xs text-muted-foreground">
        {used > max ? t("overLimit") : share >= 1 ? t("limitReached") : hint ?? t("left", { count: formatNumber(max - used) })}
      </span>
    </div>
  );
}
