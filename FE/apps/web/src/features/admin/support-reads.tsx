"use client";

import { useState } from "react";
import { PackageSearchIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  defaultSupportReportQuery,
  formatDateTime,
  formatLocalDate,
  formatMoney,
  formatNumber,
  formatPercent,
  isApiError,
  normalizeResourceId,
  type AdminReportQuery,
  type Order,
  type Organization,
  type Product,
  type Promotion,
} from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DetailList, IdText, Pager } from "./parts";
import {
  useAdminOrganizationNames,
  useSupportAgreedPrices,
  useSupportMessages,
  useSupportOrder,
  useSupportPricing,
  useSupportProducts,
  useSupportPromotions,
  useSupportReport,
  useSupportStock,
} from "./queries";
import { forgetSupportContext } from "./support-context";

/*
 * Read-only commercial views under one support context. Nothing here loads in the background:
 * each read is an explicit operator action because every successful read is audited. Money is
 * NET_EXCLUDING_VAT as stored; nothing is recomputed.
 */

const PAGE_SIZE = 25;

/** Context expired, revoked, or the record is outside this organization: the backend says 404. */
function SupportError({ error, organizationId, onRetry }: { error: unknown; organizationId: string; onRetry?: () => void }) {
  const t = useTranslations("admin.support");
  if (isApiError(error, "NOT_FOUND")) {
    return (
      <Alert>
        <AlertTitle>{t("notAvailableTitle")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <p>{t("notAvailable")}</p>
          <Button variant="outline" size="sm" onClick={() => forgetSupportContext(organizationId)}>
            {t("startNew")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return <ErrorState error={error} onRetry={onRetry} />;
}

function NetNote() {
  const t = useTranslations("admin.support");
  return <p className="text-xs text-muted-foreground">{t("netNote")}</p>;
}

// ---- Report ----

export function SupportReport({ org, accessId }: { org: Organization; accessId: string }) {
  const t = useTranslations("admin.support.report");
  const [draft, setDraft] = useState<AdminReportQuery>(() => defaultSupportReportQuery(org.country));
  const [query, setQuery] = useState<AdminReportQuery | null>(null);
  const valid = Boolean(draft.from && draft.to && draft.from <= draft.to);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setQuery({ ...draft });
          }}
        >
          <Field className="w-auto">
            <FieldLabel htmlFor="support-from">{t("from")}</FieldLabel>
            <Input id="support-from" type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="support-to">{t("to")}</FieldLabel>
            <Input id="support-to" type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="support-grouping">{t("grouping")}</FieldLabel>
            <Select value={draft.grouping} onValueChange={(v) => setDraft((d) => ({ ...d, grouping: v as AdminReportQuery["grouping"] }))}>
              <SelectTrigger id="support-grouping" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="DAY">{t("day")}</SelectItem>
                  <SelectItem value="MONTH">{t("month")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" disabled={!valid}>
            {t("load")}
          </Button>
        </form>
        {query ? <ReportResult org={org} accessId={accessId} query={query} /> : <p className="text-sm text-muted-foreground">{t("hint")}</p>}
      </CardContent>
    </Card>
  );
}

function ReportResult({ org, accessId, query }: { org: Organization; accessId: string; query: AdminReportQuery }) {
  const t = useTranslations("admin.support.report");
  const report = useSupportReport(accessId, org.id, query);
  if (report.isError) return <SupportError error={report.error} organizationId={org.id} onRetry={() => void report.refetch()} />;
  if (report.isPending) return <RowsSkeleton rows={4} />;
  const r = report.data;
  const buckets = r.buckets.filter((b) => b.orderCount > 0);
  return (
    <div className="flex flex-col gap-3">
      <DetailList
        items={[
          { label: t("orders"), value: <span className="font-mono tabular-nums">{formatNumber(r.orderCount)}</span> },
          { label: t("quantity"), value: <span className="font-mono tabular-nums">{formatNumber(r.quantity)}</span> },
          { label: t("goodsTotal"), value: <span className="font-mono tabular-nums">{formatMoney(r.goodsTotal, r.currency)}</span> },
          ...(r.activeBuyerCount != null ? [{ label: t("activeBuyers"), value: formatNumber(r.activeBuyerCount) }] : []),
          { label: t("asOf"), value: t("asOfValue", { time: formatDateTime(r.asOf), zone: r.timezone }) },
        ]}
      />
      {buckets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noOrders")}</p>
      ) : (
        <Table className="text-sm" aria-label={t("title")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("period")}</TableHead>
              <TableHead className="text-right">{t("orders")}</TableHead>
              <TableHead className="text-right">{t("quantity")}</TableHead>
              <TableHead className="text-right">{t("goodsTotal")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.map((b) => (
              <TableRow key={b.periodStart}>
                <TableCell>{formatLocalDate(b.periodStart)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatNumber(b.orderCount)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatNumber(b.quantity)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatMoney(b.goodsTotal, r.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <NetNote />
    </div>
  );
}

// ---- Orders ----

export function SupportOrders({ org, accessId }: { org: Organization; accessId: string }) {
  const t = useTranslations("admin.support.order");
  const ta = useTranslations("admin");
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const id = normalizeResourceId(input);
            setInvalid(!id);
            if (id) setOrderId(id);
          }}
        >
          <Field className="flex-1">
            <FieldLabel htmlFor="support-order-id">{t("orderId")}</FieldLabel>
            <Input id="support-order-id" value={input} onChange={(e) => setInput(e.target.value)} placeholder={ta("idPlaceholder")} aria-invalid={invalid} />
            {invalid && <FieldDescription className="text-destructive">{ta("invalidId")}</FieldDescription>}
          </Field>
          <Button type="submit" variant="outline">
            <SearchIcon data-icon="inline-start" />
            {ta("open")}
          </Button>
        </form>
        {orderId && <OrderView key={orderId} org={org} accessId={accessId} orderId={orderId} />}
      </CardContent>
    </Card>
  );
}

const ORDER_BADGE: Record<Order["state"], "info" | "success" | "secondary" | "destructive" | "warning"> = {
  AWAITING_ACCEPTANCE: "info",
  ACCEPTED: "info",
  DISPATCHED: "warning",
  DELIVERED: "success",
  REJECTED: "destructive",
  CANCELLED: "secondary",
};

function OrderView({ org, accessId, orderId }: { org: Organization; accessId: string; orderId: string }) {
  const t = useTranslations("admin.support.order");
  const order = useSupportOrder(accessId, orderId);
  const [showMessages, setShowMessages] = useState(false);
  if (order.isError) return <SupportError error={order.error} organizationId={org.id} onRetry={() => void order.refetch()} />;
  if (order.isPending) return <RowsSkeleton rows={5} />;
  const o = order.data;
  const a = o.deliveryAddress;
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{t("number", { number: o.number })}</h3>
        <Badge variant={ORDER_BADGE[o.state]}>{t(`state.${o.state}`)}</Badge>
        {o.stageName && <Badge variant="outline">{o.stageName}</Badge>}
      </div>
      <DetailList
        items={[
          { label: t("vendor"), value: o.vendor.displayName },
          { label: t("buyer"), value: o.buyer.displayName },
          { label: t("submitted"), value: formatDateTime(o.submittedAt) },
          { label: t("updated"), value: formatDateTime(o.updatedAt) },
          {
            label: t("delivery"),
            value: (
              <>
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ""}, {a.postalCode} {a.city}
                <br />
                {o.deliveryContact.name} · {o.deliveryContact.phone}
                {o.deliveryInstructions && (
                  <>
                    <br />
                    {o.deliveryInstructions}
                  </>
                )}
              </>
            ),
          },
          ...(o.fulfillmentLocation ? [{ label: t("fulfillment"), value: o.fulfillmentLocation.name }] : []),
          ...(o.note ? [{ label: t("note"), value: o.note }] : []),
          ...(o.replacementForOrderId ? [{ label: t("replaces"), value: <IdText id={o.replacementForOrderId} /> }] : []),
        ]}
      />
      <Table className="text-sm" aria-label={t("lines")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("product")}</TableHead>
            <TableHead className="text-right">{t("quantity")}</TableHead>
            <TableHead className="text-right">{t("unitPrice")}</TableHead>
            <TableHead className="text-right">{t("lineTotal")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {o.lines.map((l) => (
            <TableRow key={l.productId}>
              <TableCell className="whitespace-normal">
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">
                  {l.sku} · {l.unitName}
                  {l.packDescription ? ` · ${l.packDescription}` : ""}
                  {l.price.appliedPromotion ? ` · ${t("promotion", { name: l.price.appliedPromotion.name })}` : ""}
                  {l.price.agreedUnitPrice ? ` · ${t("agreed")}` : ""}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatNumber(l.quantity)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatMoney(l.price.finalUnitPrice, o.currency)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatMoney(l.price.lineTotal, o.currency)}</TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell colSpan={3} className="text-right font-medium">
              {t("goodsTotal")}
            </TableCell>
            <TableCell className="text-right font-mono font-medium tabular-nums">{formatMoney(o.goodsTotal, o.currency)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <NetNote />
      {showMessages ? (
        <OrderMessages org={org} accessId={accessId} order={o} />
      ) : (
        <div>
          <Button variant="outline" size="sm" onClick={() => setShowMessages(true)}>
            {t("showMessages")}
          </Button>
        </div>
      )}
    </div>
  );
}

function OrderMessages({ org, accessId, order }: { org: Organization; accessId: string; order: Order }) {
  const t = useTranslations("admin.support.order");
  const messages = useSupportMessages(accessId, order.id);
  if (messages.isError) return <SupportError error={messages.error} organizationId={org.id} onRetry={() => void messages.refetch()} />;
  if (messages.isPending) return <RowsSkeleton rows={2} />;
  const items = messages.data.pages.flatMap((p) => p.items);
  const party = (id: string) => (id === order.vendor.organizationId ? order.vendor.displayName : id === order.buyer.organizationId ? order.buyer.displayName : "—");
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">{t("messages")}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noMessages")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((m) => (
            <li key={m.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {party(m.authorOrganizationId)}
                  {m.ownAuthorDisplayName ? ` · ${m.ownAuthorDisplayName}` : ""}
                </span>
                <span>{formatDateTime(m.createdAt)}</span>
              </div>
              <p className="pt-1 whitespace-pre-wrap">{m.text}</p>
            </li>
          ))}
        </ul>
      )}
      {messages.hasNextPage && (
        <div>
          <Button variant="outline" size="sm" disabled={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>
            {messages.isFetchingNextPage && <Spinner data-icon="inline-start" />}
            {t("moreMessages")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- Products, pricing and stock (vendor contexts) ----

export function SupportProducts({ org, accessId }: { org: Organization; accessId: string }) {
  const t = useTranslations("admin.support.products");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const products = useSupportProducts(accessId, org.id, { page, size: PAGE_SIZE, includeTotal: true });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {products.isError ? (
          <SupportError error={products.error} organizationId={org.id} onRetry={() => void products.refetch()} />
        ) : products.isPending ? (
          <RowsSkeleton rows={4} />
        ) : products.data.items.length === 0 ? (
          <EmptyState icon={PackageSearchIcon} title={t("none")} />
        ) : (
          <>
            <Table className="text-sm" aria-label={t("title")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("product")}</TableHead>
                  <TableHead>{t("state")}</TableHead>
                  <TableHead className="hidden md:table-cell text-right">{t("ordering")}</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">{t("details")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.data.items.map((p) => (
                  <ProductRow key={p.id} product={p} org={org} accessId={accessId} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />
                ))}
              </TableBody>
            </Table>
            <Pager page={page} size={PAGE_SIZE} total={products.data.total} count={products.data.items.length} onPage={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ProductRow({ product: p, org, accessId, open, onToggle }: { product: Product; org: Organization; accessId: string; open: boolean; onToggle: () => void }) {
  const t = useTranslations("admin.support.products");
  return (
    <>
      <TableRow>
        <TableCell className="whitespace-normal">
          <div className="font-medium">
            {p.name}
            {p.featured && (
              <Badge variant="brand" className="ml-2">
                {t("featured")}
              </Badge>
            )}
          </div>
          <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
        </TableCell>
        <TableCell>
          <Badge variant={p.state === "ACTIVE" ? "success" : "secondary"}>{t(`productState.${p.state}`)}</Badge>
        </TableCell>
        <TableCell className="hidden md:table-cell text-right font-mono text-xs tabular-nums">
          {t("minStep", { min: formatNumber(p.minimumQuantity), step: formatNumber(p.quantityStep) })}
        </TableCell>
        <TableCell className="text-right">
          <Button variant="outline" size="sm" aria-expanded={open} onClick={onToggle}>
            {open ? t("hide") : t("pricingStock")}
          </Button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/30 whitespace-normal">
            <PricingStock org={org} accessId={accessId} productId={p.id} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function PricingStock({ org, accessId, productId }: { org: Organization; accessId: string; productId: string }) {
  const t = useTranslations("admin.support.products");
  const pricing = useSupportPricing(accessId, productId);
  const stock = useSupportStock(accessId, productId);
  return (
    <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t("pricing")}</h4>
        {pricing.isError ? (
          <SupportError error={pricing.error} organizationId={org.id} />
        ) : pricing.isPending ? (
          <RowsSkeleton rows={2} />
        ) : (
          <DetailList
            items={[
              { label: t("basePrice"), value: pricing.data.basePrice ? formatMoney(pricing.data.basePrice, pricing.data.currency) : t("noBasePrice") },
              ...pricing.data.tiers.map((tier) => ({
                label: t("tier", { quantity: formatNumber(tier.minimumQuantity) }),
                value: formatMoney(tier.unitPrice, pricing.data.currency),
              })),
            ]}
          />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t("stock")}</h4>
        {stock.isError ? (
          <SupportError error={stock.error} organizationId={org.id} />
        ) : stock.isPending ? (
          <RowsSkeleton rows={2} />
        ) : (
          <DetailList
            items={[
              { label: t("tracking"), value: stock.data.trackingEnabled ? t("trackingOn") : t("trackingOff") },
              { label: t("available"), value: stock.data.availableCount != null ? formatNumber(stock.data.availableCount) : t("notTracked") },
              { label: t("confirmationRequired"), value: stock.data.confirmationRequired ? t("yes") : t("no") },
              { label: t("credits"), value: formatNumber(stock.data.cancellationCreditQuantity) },
            ]}
          />
        )}
      </div>
    </div>
  );
}

// ---- Promotions ----

export function SupportPromotions({ org, accessId }: { org: Organization; accessId: string }) {
  const t = useTranslations("admin.support.promotions");
  const [page, setPage] = useState(0);
  const promotions = useSupportPromotions(accessId, org.id, { page, size: PAGE_SIZE, includeTotal: true });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {promotions.isError ? (
          <SupportError error={promotions.error} organizationId={org.id} onRetry={() => void promotions.refetch()} />
        ) : promotions.isPending ? (
          <RowsSkeleton rows={3} />
        ) : promotions.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <>
            <Table className="text-sm" aria-label={t("title")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("value")}</TableHead>
                  <TableHead>{t("state")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("period")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("targets")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promotions.data.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium whitespace-normal">
                      {p.name}
                      {p.archived && <span className="text-xs text-muted-foreground"> · {t("archived")}</span>}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {p.kind === "PERCENTAGE" ? t("percentOff", { value: formatPercent(p.value) }) : t("fixedPrice", { value: formatMoney(p.value, org.currency) })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.state === "RUNNING" ? "success" : p.state === "SCHEDULED" ? "info" : "secondary"}>{t(`promotionState.${p.state}`)}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">
                      {formatDateTime(p.startsAt)} – {formatDateTime(p.endsAt)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs whitespace-normal text-muted-foreground">{targetsText(p, t)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} size={PAGE_SIZE} total={promotions.data.total} count={promotions.data.items.length} onPage={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function targetsText(p: Promotion, t: ReturnType<typeof useTranslations<"admin.support.promotions">>): string {
  const products =
    p.targets.productMode === "ALL"
      ? t("allProducts")
      : [...p.targetLabels.products.map((x) => x.name), ...p.targetLabels.categories.map((x) => x.name)].join(", ") || t("noneSelected");
  const buyers = p.targets.buyerMode === "ALL" ? t("allBuyers") : p.targetLabels.buyers.map((x) => x.name).join(", ") || t("noneSelected");
  return t("targetsValue", { products, buyers });
}

// ---- Agreed prices ----

export function SupportAgreedPrices({ org, accessId }: { org: Organization; accessId: string }) {
  const t = useTranslations("admin.support.agreed");
  const [page, setPage] = useState(0);
  const agreed = useSupportAgreedPrices(accessId, org.id, { page, size: PAGE_SIZE, includeTotal: true });
  const buyers = useAdminOrganizationNames(agreed.data?.items.map((a) => a.buyerOrganizationId) ?? []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {agreed.isError ? (
          <SupportError error={agreed.error} organizationId={org.id} onRetry={() => void agreed.refetch()} />
        ) : agreed.isPending ? (
          <RowsSkeleton rows={3} />
        ) : agreed.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <>
            <Table className="text-sm" aria-label={t("title")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("buyer")}</TableHead>
                  <TableHead>{t("product")}</TableHead>
                  <TableHead className="text-right">{t("unitPrice")}</TableHead>
                  <TableHead className="text-right">{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agreed.data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{buyers.get(a.buyerOrganizationId)?.displayName ?? <IdText id={a.buyerOrganizationId} />}</TableCell>
                    <TableCell>
                      <IdText id={a.productId} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(a.unitPrice, org.currency)}</TableCell>
                    <TableCell className="text-right">
                      {a.confirmationRequired ? <Badge variant="warning">{t("needsConfirmation")}</Badge> : <Badge variant="success">{t("confirmed")}</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} size={PAGE_SIZE} total={agreed.data.total} count={agreed.data.items.length} onPage={setPage} />
            <p className="text-xs text-muted-foreground">{t("productHint")}</p>
            <NetNote />
          </>
        )}
      </CardContent>
    </Card>
  );
}
