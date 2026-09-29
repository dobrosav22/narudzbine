"use client";

import { useMemo, useState } from "react";
import { MoreHorizontalIcon, PencilIcon, PercentIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  countMsg,
  describeDates,
  describeDiscount,
  describeScope,
  promotionReach,
  promotionState,
  PROMOTION_STATE_KEY,
  sortPromotions,
  type Promotion,
  type PromotionState,
} from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBuyerConnections, useCategories, useVendorProducts } from "@/features/vendor-catalogue/queries";
import { CatalogueNav } from "./catalogue-nav";
import { PromotionDialog, type ScopeOptions } from "./promotion-dialog";
import { useDeletePromotion, usePromotions, useSavePromotion } from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText, useMsg } from "@/lib/i18n";

/** Tone per state: live is a success, scheduled is informational, paused/ended are neutral (05 §1). */
const STATE_BADGE: Record<PromotionState, "success" | "info" | "secondary" | "outline"> = {
  live: "success",
  scheduled: "info",
  paused: "secondary",
  ended: "outline",
};

/** 03 → "Featured & Promotions", promotions half: list, create, edit, pause, delete. */
export function PromotionsScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useTranslations("merch.promotions");
  const tc = useTranslations("common");
  const tm = useMsg();
  const errorText = useErrorText();
  const promotions = usePromotions(vendorOrgId);
  const categories = useCategories(vendorOrgId);
  const products = useVendorProducts({ vendorOrgId, search: "", tagIds: [] });
  const buyers = useBuyerConnections(vendorOrgId);
  const toggle = useSavePromotion(vendorOrgId);
  const remove = useDeletePromotion(vendorOrgId);
  const [editing, setEditing] = useState<Promotion | "new" | null>(null);
  const [deleting, setDeleting] = useState<Promotion | null>(null);

  const lookups = [categories, products, buyers];
  const { names, options } = useMemo(() => {
    const active = (buyers.data ?? []).filter((c) => c.relation.status === "active");
    const options: ScopeOptions = {
      category: (categories.data ?? []).map((c) => ({ id: c.id, name: c.name })),
      product: (products.data ?? []).filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name, hint: p.sku })),
      buyer: active.map((c) => ({ id: c.buyerOrg.id, name: c.buyerOrg.name })),
    };
    const names = new Map<string, string>([
      ...(categories.data ?? []).map((c) => [c.id, c.name] as const),
      ...(products.data ?? []).map((p) => [p.id, p.name] as const),
      ...(buyers.data ?? []).map((c) => [c.buyerOrg.id, c.buyerOrg.name] as const),
    ]);
    return { names, options };
  }, [categories.data, products.data, buyers.data]);

  const error = promotions.error ?? lookups.find((q) => q.isError)?.error;
  const pending = promotions.isPending || lookups.some((q) => q.isPending);
  // Sorted once per fetch; "now" is read at that moment, not on every render.
  const rows = useMemo(() => (promotions.data ? sortPromotions(promotions.data) : []), [promotions.data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("heading")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setEditing("new")} disabled={pending || !!error}>
          <PlusIcon data-icon="inline-start" />
          {t("new")}
        </Button>
      </div>
      <CatalogueNav />

      {error ? (
        <ErrorState error={error} onRetry={() => void Promise.all([promotions.refetch(), ...lookups.map((q) => q.refetch())])} />
      ) : pending ? (
        <RowsSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState icon={PercentIcon} title={t("emptyTitle")} description={t("emptyDescription")}>
          <Button onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            {t("new")}
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table className="text-sm" aria-label={t("tableAria")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("discount")}</TableHead>
                <TableHead>{t("appliesTo")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("dates")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="w-12 text-center">{t("on")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const state = promotionState(p);
                const label = `${tm(describeDiscount(p))}, ${tm(describeScope(p, names))}`;
                const toggling = toggle.isPending && toggle.variables?.promotionId === p.id;
                return (
                  <TableRow key={p.id} className={state === "ended" ? "text-muted-foreground" : undefined}>
                    <TableCell className="font-medium">{tm(describeDiscount(p))}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{tm(describeScope(p, names))}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.scope === "buyer" ? t("forBuyers") : tm(countMsg("promotions.scopeCount.product", promotionReach(p, products.data ?? [])))}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{describeDates(p)}</TableCell>
                    <TableCell>
                      <Badge variant={STATE_BADGE[state]}>{tm({ key: PROMOTION_STATE_KEY[state] })}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        aria-label={t("activeAria", { label })}
                        checked={p.isActive}
                        disabled={state === "ended" || toggling}
                        onCheckedChange={(isActive) =>
                          toggle.mutate(
                            { promotionId: p.id, fields: { isActive } },
                            {
                              onSuccess: () => toast.success(isActive ? t("resumed") : t("paused")),
                              onError: (e) => toast.error(errorText(e)),
                            },
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={t("actionsAria", { label })}>
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onSelect={() => setEditing(p)}>
                              <PencilIcon />
                              {tc("edit")}
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                              <Trash2Icon />
                              {tc("delete")}
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PromotionDialog
        vendorOrgId={vendorOrgId}
        open={editing !== null}
        promotion={editing === "new" || editing === null ? undefined : editing}
        options={options}
        products={products.data ?? []}
        names={names}
        onClose={() => setEditing(null)}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${t("deleteWhat", { discount: tm(describeDiscount(deleting)), scope: tm(describeScope(deleting, names)) })} `}
              {t("deleteNote")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                deleting &&
                remove.mutate(deleting.id, {
                  onSuccess: () => toast.success(t("deleted")),
                  onError: (e) => toast.error(errorText(e)),
                })
              }
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
