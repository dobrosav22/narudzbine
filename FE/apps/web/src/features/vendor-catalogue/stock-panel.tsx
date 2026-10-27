"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  formatNumber,
  isUncertainOutcome,
  parseDeltaInput,
  parseQuantityInput,
  stockStatus,
  STOCK_REASON_MAX,
  uuidv4,
  type Stock,
} from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ErrorState } from "@/components/query-states";
import { CatalogueFormError } from "./parts";
import { useStock, useStockMutations, useTracking } from "./queries";

const STATUS_BADGE = { absent: "outline", stale: "warning", current: "success", unknown: "outline" } as const;

export function StockStatusBadge({ stock }: { stock: Stock | undefined }) {
  const t = useTranslations("invInventory.stock");
  const status = stockStatus(stock);
  if (status === "unknown") return null;
  return <Badge variant={STATUS_BADGE[status]}>{t(status)}</Badge>;
}

/** Stock on the product editor: current count/status plus the set/adjust/confirm forms. */
export function StockCard({ productId, unitName }: { productId: string; unitName: string | undefined }) {
  const t = useTranslations("invInventory.stock");
  const stock = useStock(productId);
  const tracking = useTracking();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("title")}
          <StockStatusBadge stock={stock.data} />
        </CardTitle>
        <CardDescription>{tracking.data && !tracking.data.enabled ? t("trackingOffNote") : t("trackingOnHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {stock.isError ? (
          <ErrorState error={stock.error} onRetry={() => void stock.refetch()} />
        ) : !stock.data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <StockEditor stock={stock.data} unitName={unitName} />
        )}
        <Button asChild variant="link" className="self-start px-0">
          <Link href="/vendor/catalogue/inventory">{t("manage")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Set an absolute count (revision-guarded), adjust by a delta (Idempotency-Key kept with the
 * pending intent and reused only to retry the same body after an uncertain outcome), or confirm
 * a stale count.
 */
export function StockEditor({ stock, unitName, onDone }: { stock: Stock; unitName?: string; onDone?: () => void }) {
  const t = useTranslations("invInventory.stock");
  const m = useStockMutations(stock.productId);
  const [mode, setMode] = useState<"set" | "adjust">(stock.availableCount === null ? "set" : "adjust");
  const [count, setCount] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string>();
  // The pending delta intent: body + key. A changed body is a new intent with a new key.
  const [intent, setIntent] = useState<{ body: string; key: string } | null>(null);
  const status = stockStatus(stock);
  const pending = m.set.isPending || m.adjust.isPending || m.confirm.isPending;
  const error = m.set.error ?? m.adjust.error ?? m.confirm.error;
  const uncertain = m.adjust.isError && isUncertainOutcome(m.adjust.error);

  const reasonValue = (): string | null | false => {
    const r = reason.trim();
    if (Array.from(r).length > STOCK_REASON_MAX) {
      setProblem(t("reasonTooLong", { max: STOCK_REASON_MAX }));
      return false;
    }
    return r || null;
  };
  const finish = (message: string) => {
    toast.success(message);
    setCount("");
    setDelta("");
    setReason("");
    setIntent(null);
    onDone?.();
  };

  const submit = () => {
    setProblem(undefined);
    const r = reasonValue();
    if (r === false) return;
    if (mode === "set") {
      const n = parseQuantityInput(count, 0, stock.maximumSettableCount);
      if (n == null) return setProblem(t("countInvalid", { max: formatNumber(stock.maximumSettableCount) }));
      m.set.mutate({ expectedRevision: stock.revision, availableCount: n, reason: r }, { onSuccess: () => finish(t("saved")) });
    } else {
      const d = parseDeltaInput(delta);
      if (d == null) return setProblem(t("deltaInvalid"));
      const body = { delta: d, reason: r };
      const signature = JSON.stringify(body);
      const key = intent?.body === signature ? intent.key : uuidv4();
      setIntent({ body: signature, key });
      m.adjust.mutate({ body, key }, { onSuccess: () => finish(t("saved")) });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-2xl font-semibold tabular-nums">
          {stock.availableCount === null ? "—" : formatNumber(stock.availableCount)}
        </span>
        {unitName && stock.availableCount !== null && <span className="text-sm text-muted-foreground">{unitName}</span>}
        {stock.cancellationCreditQuantity > 0 && (
          <span className="text-sm text-muted-foreground">{t("credit", { count: formatNumber(stock.cancellationCreditQuantity) })}</span>
        )}
      </div>
      {status === "stale" && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={pending}
          onClick={() => m.confirm.mutate(stock.revision, { onSuccess: () => finish(t("confirmed")) })}
        >
          {m.confirm.isPending && <Spinner data-icon="inline-start" />}
          {t("confirm")}
        </Button>
      )}
      <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as "set" | "adjust")}>
        <ToggleGroupItem value="set">{t("set")}</ToggleGroupItem>
        <ToggleGroupItem value="adjust" disabled={stock.availableCount === null}>
          {t("adjust")}
        </ToggleGroupItem>
      </ToggleGroup>
      <FieldGroup>
        {mode === "set" ? (
          <Field data-invalid={!!problem || undefined}>
            <FieldLabel htmlFor={`count-${stock.productId}`}>{t("newCount")}</FieldLabel>
            <Input id={`count-${stock.productId}`} inputMode="numeric" className="font-mono" value={count} onChange={(e) => setCount(e.target.value)} />
          </Field>
        ) : (
          <Field data-invalid={!!problem || undefined}>
            <FieldLabel htmlFor={`delta-${stock.productId}`}>{t("delta")}</FieldLabel>
            <Input
              id={`delta-${stock.productId}`}
              inputMode="numeric"
              className="font-mono"
              placeholder={t("deltaPlaceholder")}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor={`reason-${stock.productId}`}>{t("reason")}</FieldLabel>
          <Input id={`reason-${stock.productId}`} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {problem && <FieldError>{problem}</FieldError>}
        {uncertain ? <p className="text-sm text-destructive">{t("uncertain")}</p> : <CatalogueFormError error={error} />}
        <div>
          <Button type="button" disabled={pending} onClick={submit}>
            {(m.set.isPending || m.adjust.isPending) && <Spinner data-icon="inline-start" />}
            {uncertain ? t("retry") : mode === "set" ? t("set") : t("adjust")}
          </Button>
        </div>
      </FieldGroup>
    </div>
  );
}
