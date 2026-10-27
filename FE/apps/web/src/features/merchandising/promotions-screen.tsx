"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon, PercentIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { formatDateTime, formatMoney, formatNumber, formatPercent, promotionActions, type Promotion, type PromotionState } from "@repo/core";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBusiness } from "@/lib/session";
import { useCatalogueErrorText } from "@/features/vendor-catalogue/parts";
import { CatalogueNav } from "./catalogue-nav";
import { PromotionDialog } from "./promotion-dialog";
import { usePromotionMutations, usePromotions } from "./queries";

const STATE_BADGE: Record<PromotionState, "success" | "info" | "secondary" | "outline"> = {
  RUNNING: "success",
  SCHEDULED: "info",
  STOPPED: "secondary",
  ENDED: "outline",
};
const PAGE_SIZE = 25;
type Filter = "all" | PromotionState;

/** Promotions: list by state, create/edit before start, stop, archive after end/stop. */
export function PromotionsScreen() {
  const t = useTranslations("merch.promotions");
  const tv = useTranslations("vendorCatalogue");
  const errorText = useCatalogueErrorText();
  const { organization } = useBusiness();
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const promotions = usePromotions({ page, size: PAGE_SIZE, includeTotal: true, ...(filter !== "all" ? { state: filter } : {}) });
  const m = usePromotionMutations();
  const [editing, setEditing] = useState<Promotion | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ promotion: Promotion; action: "stop" | "archive" } | null>(null);
  const rows = promotions.data?.items ?? [];
  const total = promotions.data?.total ?? 0;

  const discount = (p: Promotion) =>
    p.kind === "PERCENTAGE" ? t("percentOff", { value: formatPercent(p.value) }) : t("fixedPrice", { price: formatMoney(p.value, organization.currency) });
  const products = (p: Promotion) =>
    p.targets.productMode === "ALL"
      ? t("allProducts")
      : t("targets", {
          products: p.targets.productIds.length,
          categories: p.targets.categoryIds.length,
          both: p.targets.productIds.length > 0 && p.targets.categoryIds.length > 0 ? "yes" : "no",
        });
  const buyers = (p: Promotion) => (p.targets.buyerMode === "ALL" ? t("allBuyers") : t("someBuyers", { count: p.targets.buyerIds.length }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("heading")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <PlusIcon data-icon="inline-start" />
          {t("new")}
        </Button>
      </div>
      <CatalogueNav />
      <ToggleGroup
        type="single"
        variant="outline"
        className="flex-wrap"
        aria-label={t("filterAria")}
        value={filter}
        onValueChange={(v) => {
          if (!v) return;
          setFilter(v as Filter);
          setPage(0);
        }}
      >
        <ToggleGroupItem value="all">{t("allStates")}</ToggleGroupItem>
        {(["RUNNING", "SCHEDULED", "STOPPED", "ENDED"] as const).map((s) => (
          <ToggleGroupItem key={s} value={s}>
            {t(`state.${s}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {promotions.isError ? (
        <ErrorState error={promotions.error} onRetry={() => void promotions.refetch()} />
      ) : promotions.isPending ? (
        <RowsSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState icon={PercentIcon} title={t("emptyTitle")} description={t("emptyDescription")}>
          <Button onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            {t("new")}
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table className="text-sm" aria-label={t("tableAria")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("discount")}</TableHead>
                  <TableHead>{t("appliesTo")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("dates")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const actions = promotionActions(p);
                  return (
                    <TableRow key={p.id} className={p.archived || p.state === "ENDED" ? "text-muted-foreground" : undefined}>
                      <TableCell>
                        <button type="button" className="text-left font-medium hover:underline" onClick={() => setEditing(p)}>
                          {p.name}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">{discount(p)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{products(p)}</span>
                          <span className="text-xs text-muted-foreground">{buyers(p)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{t("range", { start: formatDateTime(p.startsAt), end: formatDateTime(p.endsAt) })}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={STATE_BADGE[p.state]}>{t(`state.${p.state}`)}</Badge>
                          {p.archived && <Badge variant="outline">{t("archived")}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={t("actionsAria", { name: p.name })}>
                              <MoreHorizontalIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem onSelect={() => setEditing(p)}>{actions.edit ? t("edit") : t("view")}</DropdownMenuItem>
                              {actions.stop && (
                                <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ promotion: p, action: "stop" })}>
                                  {t("stop")}
                                </DropdownMenuItem>
                              )}
                              {actions.archive && <DropdownMenuItem onSelect={() => setConfirm({ promotion: p, action: "archive" })}>{t("archive")}</DropdownMenuItem>}
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
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
              <span>
                {formatNumber(page + 1)} / {formatNumber(Math.ceil(total / PAGE_SIZE))}
              </span>
              <Button variant="outline" size="icon-sm" aria-label={tv("previous")} disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
                <ChevronLeftIcon />
              </Button>
              <Button variant="outline" size="icon-sm" aria-label={tv("next")} disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((n) => n + 1)}>
                <ChevronRightIcon />
              </Button>
            </div>
          )}
        </>
      )}

      {editing && <PromotionDialog promotion={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm && (confirm.action === "stop" ? t("stopTitle", { name: confirm.promotion.name }) : t("archiveTitle", { name: confirm.promotion.name }))}
            </AlertDialogTitle>
            <AlertDialogDescription>{confirm?.action === "stop" ? t("stopDescription") : t("archiveDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.action === "stop" ? "destructive" : "default"}
              onClick={() => {
                if (!confirm) return;
                const { promotion, action } = confirm;
                const mutation = action === "stop" ? m.stop : m.archive;
                mutation.mutate(
                  { id: promotion.id, expectedRevision: promotion.revision },
                  { onSuccess: () => toast.success(action === "stop" ? t("stopped") : t("archivedDone")), onError: (e) => toast.error(errorText(e)) },
                );
              }}
            >
              {confirm?.action === "stop" ? t("stop") : t("archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
