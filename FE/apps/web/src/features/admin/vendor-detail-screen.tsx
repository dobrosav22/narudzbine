"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, Building2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  formatDate,
  formatMoney,
  formatNumber,
  isAtLimit,
  isServiceError,
  planChangeProblems,
  UPGRADE_REQUEST_STATUS_KEY,
  type AdminVendorDetail,
  type SubscriptionTier,
  type TierUpgradeRequest,
  type Msg,
} from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/features/stats/stat-parts";
import { ConnectionsCard } from "./connections";
import { useAdminBuyers, useAdminVendor, useResolveRequest, useSetTier, useTiers } from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText, useMsg } from "@/lib/i18n";

const REQUEST_BADGE: Record<TierUpgradeRequest["status"], "info" | "success" | "secondary"> = {
  pending: "info",
  fulfilled: "success",
  dismissed: "secondary",
};

/**
 * 03 v1.1 → "Vendor detail": usage, direct set-tier, upgrade requests (resolve with any tier,
 * or dismiss), basic stats, and connected buyers with link/unlink.
 */
export function AdminVendorDetailScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useTranslations("admin");
  const tm = useMsg();
  const detail = useAdminVendor(vendorOrgId);
  const tiers = useTiers();
  const buyers = useAdminBuyers();

  if (detail.isError) {
    return isServiceError(detail.error, "NOT_FOUND") ? (
      <EmptyState icon={Building2Icon} title={t("vendorNotFound")}>
        <Button asChild variant="outline">
          <Link href="/admin/vendors">{t("allVendors")}</Link>
        </Button>
      </EmptyState>
    ) : (
      <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
    );
  }
  if (tiers.isError) return <ErrorState error={tiers.error} onRetry={() => void tiers.refetch()} />;
  if (detail.isPending || tiers.isPending) return <RowsSkeleton rows={6} />;
  const d = detail.data;
  const tm0 = (m: Msg | undefined) => (m ? tm(m) : undefined);
  const connectedIds = new Set(d.connections.map((c) => c.buyerOrg.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("backToVendors")}>
          <Link href="/admin/vendors">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {d.vendorOrg.name}
            <Badge variant="secondary">{d.tier.name}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("vendorSince", { date: formatDate(d.vendorOrg.createdAt) })} · {d.vendorOrg.tracksInventory ? t("tracksInventory") : t("noInventory")}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("products")} value={`${formatNumber(d.usage.productCount)} / ${formatNumber(d.usage.maxProducts)}`} footer={tm0(limitNote(d, "products"))} />
        <StatCard label={t("buyers")} value={`${formatNumber(d.usage.buyerCount)} / ${formatNumber(d.usage.maxBuyers)}`} footer={tm0(limitNote(d, "buyers")) ?? t("pendingCount")} />
        <StatCard label={t("orders")} value={formatNumber(d.orderCount)} />
        <StatCard label={t("users")} value={formatNumber(d.userCount)} />
      </div>

      <PlanCard detail={d} tiers={tiers.data} />
      <RequestsCard detail={d} tiers={tiers.data} />
      <ConnectionsCard
        title={t("connectedBuyers")}
        description={t("connectedBuyersDescription")}
        side="vendor"
        selfId={d.vendorOrg.id}
        selfName={d.vendorOrg.name}
        rows={d.connections.map((c) => ({ relation: c.relation, other: { id: c.buyerOrg.id, name: c.buyerOrg.name, href: `/admin/buyers/${c.buyerOrg.id}` } }))}
        candidates={(buyers.data ?? []).filter((b) => !connectedIds.has(b.buyerOrg.id)).map((b) => ({ id: b.buyerOrg.id, name: b.buyerOrg.name }))}
        linkHint={isAtLimit(d.usage, "buyers") ? t("linkHintVendor") : undefined}
      />
    </div>
  );
}

function limitNote(d: AdminVendorDetail, limit: "products" | "buyers"): Msg | undefined {
  const [used, max] = limit === "products" ? [d.usage.productCount, d.usage.maxProducts] : [d.usage.buyerCount, d.usage.maxBuyers];
  return used > max ? { key: 'admin.overBlocked' } : used >= max ? { key: 'admin.atBlocked' } : undefined;
}

function TierSelect({ tiers, value, onChange, id }: { tiers: SubscriptionTier[]; value: string; onChange: (id: string) => void; id: string }) {
  const tp = useTranslations("planText");
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {tiers.map((tier) => (
            <SelectItem key={tier.id} value={tier.id}>
              {tp("perMonth", { plan: tier.name, price: formatMoney(tier.priceMonthly) })}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** Direct override (04 v1.1: POST /admin/vendor-orgs/:id/set-tier), independent of any request. */
function PlanCard({ detail, tiers }: { detail: AdminVendorDetail; tiers: SubscriptionTier[] }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tm = useMsg();
  const errorText = useErrorText();
  const [picked, setPicked] = useState(detail.tier.id);
  const [confirming, setConfirming] = useState(false);
  const setTier = useSetTier(detail.vendorOrg.id);
  const target = tiers.find((tier) => tier.id === picked);
  const warnings = target ? planChangeProblems(detail.usage, target) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("plan")}</CardTitle>
        <CardDescription>
          {t("planLine", {
            plan: detail.tier.name,
            price: formatMoney(detail.tier.priceMonthly),
            products: formatNumber(detail.tier.maxProducts),
            buyers: formatNumber(detail.tier.maxBuyers),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="admin-set-tier">{t("changePlan")}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <TierSelect id="admin-set-tier" tiers={tiers} value={picked} onChange={setPicked} />
            <Button variant="outline" disabled={picked === detail.tier.id || setTier.isPending} onClick={() => setConfirming(true)}>
              {setTier.isPending && <Spinner data-icon="inline-start" />}
              {t("changePlan")}
            </Button>
          </div>
        </Field>
        {warnings.length > 0 && picked !== detail.tier.id && (
          <Alert>
            <AlertTitle>{t("wouldBeOver", { plan: target?.name ?? "" })}</AlertTitle>
            <AlertDescription>{[...warnings.map(tm), t("wouldBeBlocked")].join(" ")}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("moveTitle", { vendor: detail.vendorOrg.name, plan: target?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("moveDescription")} {detail.hasPendingRequest && t("movePending")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                setTier.mutate(picked, {
                  onSuccess: () => toast.success(t("nowOn", { vendor: detail.vendorOrg.name, plan: target?.name ?? "" })),
                  onError: (e) => toast.error(errorText(e)),
                })
              }
            >
              {t("changePlan")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function RequestsCard({ detail, tiers }: { detail: AdminVendorDetail; tiers: SubscriptionTier[] }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tm = useMsg();
  const errorText = useErrorText();
  const resolve = useResolveRequest(detail.vendorOrg.id);
  const [fulfilling, setFulfilling] = useState<TierUpgradeRequest | null>(null);
  const [dismissing, setDismissing] = useState<TierUpgradeRequest | null>(null);
  const tierName = (id: string | undefined) => tiers.find((tier) => tier.id === id)?.name ?? "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("requests")}</CardTitle>
        <CardDescription>{t("requestsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {detail.upgradeRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noRequests")}</p>
        ) : (
          <Table className="text-sm" aria-label={t("requests")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("requested")}</TableHead>
                <TableHead>{t("sent")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("note")}</TableHead>
                <TableHead className="text-right">{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.upgradeRequests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{tierName(r.requestedTierId)}</TableCell>
                  <TableCell>{formatDate(r.createdAt)}</TableCell>
                  <TableCell className="hidden md:table-cell whitespace-normal text-muted-foreground">{r.message ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" onClick={() => setFulfilling(r)}>
                          {t("applyPlan")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDismissing(r)}>
                          {t("decline")}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={REQUEST_BADGE[r.status]}>{tm({ key: UPGRADE_REQUEST_STATUS_KEY[r.status] })}</Badge>
                        {r.resolvedAt && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(r.resolvedAt)}
                            {r.appliedTierId && r.appliedTierId !== r.requestedTierId && ` · ${t("applied", { plan: tierName(r.appliedTierId) })}`}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <FulfilDialog
        detail={detail}
        tiers={tiers}
        request={fulfilling}
        pending={resolve.isPending}
        onClose={() => setFulfilling(null)}
        onApply={(request, tierId) =>
          resolve.mutate(
            { requestId: request.id, resolution: { action: "fulfill", tierId } },
            {
              onSuccess: () => {
                toast.success(t("nowOn", { vendor: detail.vendorOrg.name, plan: tierName(tierId) }));
                setFulfilling(null);
              },
              onError: (e) => toast.error(errorText(e)),
            },
          )
        }
      />

      <AlertDialog open={dismissing !== null} onOpenChange={(o) => !o && setDismissing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("declineTitle", { plan: tierName(dismissing?.requestedTierId) })}</AlertDialogTitle>
            <AlertDialogDescription>{t("declineDescription", { vendor: detail.vendorOrg.name, plan: detail.tier.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                dismissing &&
                resolve.mutate(
                  { requestId: dismissing.id, resolution: { action: "dismiss" } },
                  {
                    onSuccess: () => toast.success(t("declined")),
                    onError: (e) => toast.error(errorText(e)),
                  },
                )
              }
            >
              {t("decline")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function FulfilDialog({
  detail,
  tiers,
  request,
  pending,
  onClose,
  onApply,
}: {
  detail: AdminVendorDetail;
  tiers: SubscriptionTier[];
  request: TierUpgradeRequest | null;
  pending: boolean;
  onClose: () => void;
  onApply: (request: TierUpgradeRequest, tierId: string) => void;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {request && <FulfilForm key={request.id} detail={detail} tiers={tiers} request={request} pending={pending} onClose={onClose} onApply={onApply} />}
      </DialogContent>
    </Dialog>
  );
}

function FulfilForm({
  detail,
  tiers,
  request,
  pending,
  onClose,
  onApply,
}: {
  detail: AdminVendorDetail;
  tiers: SubscriptionTier[];
  request: TierUpgradeRequest;
  pending: boolean;
  onClose: () => void;
  onApply: (request: TierUpgradeRequest, tierId: string) => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tm = useMsg();
  const [tierId, setTierId] = useState(request.requestedTierId);
  const target = tiers.find((tier) => tier.id === tierId);
  const warnings = target ? planChangeProblems(detail.usage, target) : [];
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("applyTitle", { vendor: detail.vendorOrg.name })}</DialogTitle>
        <DialogDescription>
          {request.message
            ? t("askedForNote", { plan: tiers.find((tier) => tier.id === request.requestedTierId)?.name ?? "", note: request.message })
            : t("askedFor", { plan: tiers.find((tier) => tier.id === request.requestedTierId)?.name ?? "" })}{" "}
          {t("markedApproved")}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="admin-fulfil-tier">{t("planToApply")}</FieldLabel>
        <TierSelect id="admin-fulfil-tier" tiers={tiers} value={tierId} onChange={setTierId} />
      </Field>
      {warnings.length > 0 && (
        <Alert>
          <AlertTitle>{t("theyWouldBeOver", { plan: target?.name ?? "" })}</AlertTitle>
          <AlertDescription>{warnings.map(tm).join(" ")}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button disabled={pending} onClick={() => onApply(request, tierId)}>
          {pending && <Spinner data-icon="inline-start" />}
          {t("apply", { plan: target?.name ?? "" })}
        </Button>
      </DialogFooter>
    </>
  );
}
