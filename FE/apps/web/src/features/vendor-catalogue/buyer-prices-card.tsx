"use client";

import { useMemo, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { currencySymbol, formatMoney, formatPercent, parseDecimal, toDecimalInput, type Product } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState } from "@/components/query-states";
import { useBuyerConnections, useBuyerOverrides, useDeleteBuyerOverride, useSetBuyerOverride } from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText } from "@/lib/i18n";

/**
 * 01 §3 per-buyer negotiated prices for one product. Saved immediately (each
 * row is its own record — not part of the product form's Save). Upsert: picking
 * a buyer who already has a price updates it.
 */
export function BuyerPricesCard({ vendorOrgId, product }: { vendorOrgId: string; product: Product }) {
  const t = useTranslations("buyerPrices");
  const errorText = useErrorText();
  const overrides = useBuyerOverrides(vendorOrgId, product.id);
  const connections = useBuyerConnections(vendorOrgId);
  const setOverride = useSetBuyerOverride(vendorOrgId, product.id);
  const deleteOverride = useDeleteBuyerOverride(vendorOrgId, product.id);
  const [buyerOrgId, setBuyerOrgId] = useState<string>();
  const [price, setPrice] = useState("");
  const [priceError, setPriceError] = useState<string>();

  // Only active connections can be priced; names for existing rows come from all connections.
  const buyerName = useMemo(
    () => new Map(connections.data?.map((c) => [c.buyerOrg.id, c.buyerOrg.name])),
    [connections.data],
  );
  const activeBuyers = connections.data?.filter((c) => c.relation.status === "active") ?? [];
  const existing = overrides.data?.find((o) => o.buyerOrgId === buyerOrgId);

  const submit = () => {
    const value = parseDecimal(price);
    if (!buyerOrgId) return;
    if (value === undefined || value < 0) {
      setPriceError(t("priceInvalid"));
      return;
    }
    setOverride.mutate(
      { buyerOrgId, price: value },
      {
        onSuccess: () => {
          toast.success(t(existing ? "updated" : "set", { buyer: buyerName.get(buyerOrgId) ?? "", price: formatMoney(value) }));
          setBuyerOrgId(undefined);
          setPrice("");
        },
      },
    );
  };

  const failed = overrides.isError ? overrides : connections.isError ? connections : undefined;
  const rows = overrides.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {failed ? (
          <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
        ) : overrides.isPending || connections.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="rounded-lg border">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("buyer")}</TableHead>
                  <TableHead className="text-right">{t("price")}</TableHead>
                  <TableHead className="text-right">{t("vsBase")}</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => {
                  const diff = product.basePrice > 0 ? ((o.price - product.basePrice) / product.basePrice) * 100 : 0;
                  return (
                    <TableRow key={o.id}>
                      <TableCell>{buyerName.get(o.buyerOrgId) ?? t("formerBuyer")}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(o.price)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                        {diff > 0 ? "+" : ""}
                        {formatPercent(Math.round(diff * 10) / 10)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("removeAria", { buyer: buyerName.get(o.buyerOrgId) ?? t("buyerFallback") })}
                          disabled={deleteOverride.isPending}
                          onClick={() =>
                            deleteOverride.mutate(o, {
                              onSuccess: () => toast.success(t("removed", { buyer: buyerName.get(o.buyerOrgId) ?? t("buyer") })),
                            })
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {activeBuyers.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Field className="sm:w-56">
              <FieldLabel htmlFor="override-buyer" className="sr-only">
                {t("buyer")}
              </FieldLabel>
              <Select
                value={buyerOrgId ?? ""}
                onValueChange={(v) => {
                  setBuyerOrgId(v);
                  const current = overrides.data?.find((o) => o.buyerOrgId === v);
                  setPrice(current ? toDecimalInput(current.price) : "");
                  setPriceError(undefined);
                }}
              >
                <SelectTrigger id="override-buyer" className="w-full">
                  <SelectValue placeholder={t("chooseBuyer")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {activeBuyers.map((c) => (
                      <SelectItem key={c.buyerOrg.id} value={c.buyerOrg.id}>
                        {c.buyerOrg.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="sm:w-40" data-invalid={!!priceError || undefined}>
              <FieldLabel htmlFor="override-price" className="sr-only">
                {t("negotiated")}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="override-price"
                  inputMode="decimal"
                  className="font-mono"
                  placeholder="0,00"
                  value={price}
                  aria-invalid={!!priceError || undefined}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setPriceError(undefined);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault(); // this card sits inside the product form
                      submit();
                    }
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{currencySymbol()}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldError>{priceError}</FieldError>
            </Field>
            <Button type="button" variant="outline" disabled={!buyerOrgId || !price || setOverride.isPending} onClick={submit}>
              {setOverride.isPending && <Spinner data-icon="inline-start" />}
              {existing ? t("update") : t("setPrice")}
            </Button>
          </div>
        )}
        {!!setOverride.error && <p className="text-sm text-destructive">{errorText(setOverride.error)}</p>}
      </CardContent>
    </Card>
  );
}
