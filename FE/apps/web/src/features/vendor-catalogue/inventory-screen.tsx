"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  formatDateTime,
  formatNumber,
  isApiError,
  parseQuantityInput,
  QUANTITY_MAX,
  type Product,
  type ReconciliationLine,
  type Stock,
} from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CatalogueNav } from "@/features/merchandising/catalogue-nav";
import { CatalogueFormError, useCatalogueErrorText } from "./parts";
import {
  useInventoryMutations,
  useProducts,
  useProductsById,
  useReconciliation,
  useReconciliationLines,
  useStockEvents,
  useStocks,
  useTracking,
} from "./queries";
import { StockEditor, StockStatusBadge } from "./stock-panel";

const PAGE_SIZE = 25;

/** Inventory: tracking mode, the all-product review that enables tracking, per-product counts and history. */
export function InventoryScreen() {
  const t = useTranslations("invInventory");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const reviewId = params.get("review");
  const setReview = (id: string | null) => router.replace(id ? `${pathname}?review=${id}` : pathname);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <CatalogueNav />
      <TrackingCard reviewing={!!reviewId} onStartReview={setReview} />
      {reviewId && <ReviewCard previewId={reviewId} onLeave={() => setReview(null)} />}
      <StockTable />
      <EventsCard />
    </div>
  );
}

function TrackingCard({ reviewing, onStartReview }: { reviewing: boolean; onStartReview: (id: string) => void }) {
  const t = useTranslations("invInventory.tracking");
  const tc = useTranslations("common");
  const errorText = useCatalogueErrorText();
  const tracking = useTracking();
  const m = useInventoryMutations();
  const [confirming, setConfirming] = useState(false);
  if (tracking.isError) return <ErrorState error={tracking.error} onRetry={() => void tracking.refetch()} />;
  if (!tracking.data) return <Skeleton className="h-28 w-full" />;
  const on = tracking.data.enabled;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("title")}
          <Badge variant={on ? "success" : "secondary"}>{on ? t("on") : t("off")}</Badge>
        </CardTitle>
        <CardDescription>{on ? t("onDescription") : `${t("offDescription")} ${t("enableDescription")}`}</CardDescription>
        <CardAction>
          {on ? (
            <Button variant="outline" disabled={m.disable.isPending} onClick={() => setConfirming(true)}>
              {t("disable")}
            </Button>
          ) : (
            !reviewing && (
              <Button
                disabled={m.prepare.isPending}
                onClick={() => m.prepare.mutate(undefined, { onSuccess: (r) => onStartReview(r.id), onError: (e) => toast.error(errorText(e)) })}
              >
                {m.prepare.isPending && <Spinner data-icon="inline-start" />}
                {t("enable")}
              </Button>
            )
          )}
        </CardAction>
      </CardHeader>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("disableTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("disableDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                m.disable.mutate(tracking.data!.revision, { onSuccess: () => toast.success(t("disabled")), onError: (e) => toast.error(errorText(e)) })
              }
            >
              {t("disable")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ReviewCard({ previewId, onLeave }: { previewId: string; onLeave: () => void }) {
  const t = useTranslations("invInventory.review");
  const reconciliation = useReconciliation(previewId);
  const lines = useReconciliationLines(previewId);
  const m = useInventoryMutations();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const loaded = useMemo(() => lines.data?.pages.flatMap((p) => p.items) ?? [], [lines.data]);
  const products = useProductsById(loaded.map((l) => l.productId));
  const byId = new Map<string, Product>();
  products.forEach((q) => q.data && byId.set(q.data.id, q.data));

  const failure = reconciliation.error ?? lines.error;
  const stale = isApiError(failure, "PREVIEW_STALE") || isApiError(failure, "PREVIEW_EXPIRED") || isApiError(m.enable.error, "PREVIEW_STALE");
  if (failure && !stale) return <ErrorState error={failure} onRetry={() => void Promise.all([reconciliation.refetch(), lines.refetch()])} />;
  if (stale) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>{t("stale")}</p>
          <Button size="sm" variant="outline" onClick={onLeave}>
            {t("startNew")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!reconciliation.data || !lines.data) return <Skeleton className="h-48 w-full" />;
  const r = reconciliation.data;
  const complete = r.confirmedCount >= r.productCount;

  const acknowledge = (page: ReconciliationLine[]) => {
    const bad = new Set<string>();
    const batch = page.map((line) => {
      const raw = counts[line.productId];
      const value = raw === undefined ? line.availableCount : parseQuantityInput(raw, 0, QUANTITY_MAX - line.cancellationCreditQuantity);
      if (value == null) bad.add(line.productId);
      return { productId: line.productId, expectedRevision: line.expectedRevision, availableCount: value ?? 0 };
    });
    setInvalid(bad);
    if (bad.size) return;
    m.acknowledge.mutate(
      { previewId, expectedRevision: r.revision, lines: batch },
      {
        onSuccess: () => {
          toast.success(t("pageConfirmed"));
          void lines.refetch();
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("description")} {t("expires", { time: formatDateTime(r.expiresAt) })}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" onClick={onLeave}>
            {t("cancel")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Progress value={r.productCount ? (r.confirmedCount / r.productCount) * 100 : 100} />
          <span className="text-sm text-muted-foreground">{t("progress", { done: formatNumber(r.confirmedCount), total: formatNumber(r.productCount) })}</span>
        </div>
        <CatalogueFormError error={m.acknowledge.error ?? m.enable.error} />
        {lines.data.pages.map((page, pi) => (
          <div key={pi} className="flex flex-col gap-2">
            <div className="rounded-lg border">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("product")}</TableHead>
                    <TableHead className="hidden text-right md:table-cell">{t("credit")}</TableHead>
                    <TableHead className="w-36 text-right">{t("count")}</TableHead>
                    <TableHead className="w-32 text-right">{t("confirmed")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.items.map((line) => {
                    const p = byId.get(line.productId);
                    return (
                      <TableRow key={line.productId}>
                        <TableCell>
                          {p ? (
                            <span className="flex flex-col">
                              <span className="font-medium">{p.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {p.sku} {p.state === "ARCHIVED" && `· ${t("archived")}`}
                              </span>
                            </span>
                          ) : (
                            <Skeleton className="h-4 w-32" />
                          )}
                        </TableCell>
                        <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{formatNumber(line.cancellationCreditQuantity)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            inputMode="numeric"
                            className="ml-auto w-28 text-right font-mono"
                            aria-label={`${t("count")}: ${p?.name ?? line.productId}`}
                            aria-invalid={invalid.has(line.productId) || undefined}
                            value={counts[line.productId] ?? String(line.availableCount)}
                            onChange={(e) => setCounts((c) => ({ ...c, [line.productId]: e.target.value }))}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={line.acknowledged ? "success" : "outline"}>{line.acknowledged ? t("confirmed") : t("pending")}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {invalid.size > 0 && page.items.some((l) => invalid.has(l.productId)) && (
              <p className="text-sm text-destructive">{t("countInvalid", { max: formatNumber(QUANTITY_MAX) })}</p>
            )}
            <div>
              <Button variant="outline" size="sm" disabled={m.acknowledge.isPending || page.items.length === 0} onClick={() => acknowledge(page.items)}>
                {t("confirmPage", { count: page.items.length })}
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {lines.hasNextPage && (
            <Button variant="outline" disabled={lines.isFetchingNextPage} onClick={() => void lines.fetchNextPage()}>
              {lines.isFetchingNextPage && <Spinner data-icon="inline-start" />}
              {t("loadMore")}
            </Button>
          )}
          <Button
            disabled={!complete || m.enable.isPending}
            onClick={() => m.enable.mutate({ previewId, expectedRevision: r.revision }, { onSuccess: () => { toast.success(t("finished")); onLeave(); } })}
          >
            {m.enable.isPending && <Spinner data-icon="inline-start" />}
            {t("finish")}
          </Button>
        </div>
        {!complete && <p className="text-sm text-muted-foreground">{t("incomplete")}</p>}
      </CardContent>
    </Card>
  );
}

function StockTable() {
  const t = useTranslations("invInventory.stock");
  const tv = useTranslations("vendorCatalogue");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ product: Product; stock: Stock } | null>(null);
  const products = useProducts({ page, size: PAGE_SIZE, includeTotal: true, sort: "NAME_ASC" });
  const items = products.data?.items ?? [];
  const stocks = useStocks(items.map((p) => p.id));
  const total = products.data?.total ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {products.isError ? (
          <ErrorState error={products.error} onRetry={() => void products.refetch()} />
        ) : products.isPending ? (
          <RowsSkeleton rows={5} />
        ) : (
          <div className="rounded-lg border">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("product")}</TableHead>
                  <TableHead className="text-right">{t("available")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p, i) => {
                  const stock = stocks[i]?.data;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/vendor/catalogue/${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {stock ? (stock.availableCount === null ? "—" : formatNumber(stock.availableCount)) : <Skeleton className="ml-auto h-4 w-10" />}
                      </TableCell>
                      <TableCell>
                        <StockStatusBadge stock={stock} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" disabled={!stock} onClick={() => stock && setEditing({ product: p, stock })}>
                          {t("set")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <span>{tv("page", { page: formatNumber(page + 1) })}</span>
            <Button variant="outline" size="icon-sm" aria-label={tv("previous")} disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
              <ChevronLeftIcon />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label={tv("next")} disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((n) => n + 1)}>
              <ChevronRightIcon />
            </Button>
          </div>
        )}
      </CardContent>
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("setTitle", { name: editing.product.name })}</DialogTitle>
            </DialogHeader>
            <StockEditor stock={editing.stock} onDone={() => setEditing(null)} />
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function EventsCard() {
  const t = useTranslations("invInventory.events");
  const ts = useTranslations("invInventory.stock");
  const events = useStockEvents();
  const rows = useMemo(() => events.data?.pages.flatMap((p) => p.items) ?? [], [events.data]);
  const products = useProductsById([...new Set(rows.map((e) => e.productId))]);
  const names = new Map<string, string>();
  products.forEach((q) => q.data && names.set(q.data.id, q.data.name));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {events.isError ? (
          <ErrorState error={events.error} onRetry={() => void events.refetch()} />
        ) : events.isPending ? (
          <RowsSkeleton rows={3} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="rounded-lg border">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("when")}</TableHead>
                  <TableHead>{ts("product")}</TableHead>
                  <TableHead>{t("change")}</TableHead>
                  <TableHead className="text-right">{t("result")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("reason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(e.createdAt)}</TableCell>
                    <TableCell>{names.get(e.productId) ?? "…"}</TableCell>
                    <TableCell>
                      {t(`type.${e.type}`)}
                      {e.delta !== 0 && <span className="ml-2 font-mono tabular-nums">{`${e.delta > 0 ? "+" : ""}${formatNumber(e.delta)}`}</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatNumber(e.after)}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{e.reason ?? (e.orderId ? t("fromOrder") : "")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {events.hasNextPage && (
          <Button variant="outline" className="self-start" disabled={events.isFetchingNextPage} onClick={() => void events.fetchNextPage()}>
            {t("loadMore")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
