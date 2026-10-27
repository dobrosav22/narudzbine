"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { currencySymbol, formatMoney, parsePriceInput, priceToInput, type AgreedPrice, type CatalogueBuyer, type Product } from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState } from "@/components/query-states";
import { useBusiness } from "@/lib/session";
import { useCatalogueErrorText } from "./parts";
import { useAgreedPriceMutations, useAgreedPrices, useCatalogueBuyers } from "./queries";

/**
 * Agreed prices for this product across active buyer connections. Each row saves on its own
 * (PUT with the current agreement revision, or null for a new one). The buyer's reconnection
 * review/confirmation happens on the buyer side.
 */
export function BuyerPricesCard({ product }: { product: Product }) {
  const t = useTranslations("buyerPrices");
  const buyers = useCatalogueBuyers();
  const relationshipIds = buyers.data?.map((b) => b.relationship.id) ?? [];
  const agreed = useAgreedPrices(relationshipIds);
  const failed = buyers.isError ? buyers : agreed.find((q) => q.isError);
  const loading = buyers.isPending || agreed.some((q) => q.isPending);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {failed ? (
          <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
        ) : loading ? (
          <Skeleton className="h-20 w-full" />
        ) : buyers.data!.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="rounded-lg border">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("buyer")}</TableHead>
                  <TableHead className="w-72 text-right">{t("price")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buyers.data!.map((buyer, i) => (
                  <BuyerRow
                    key={buyer.relationship.id}
                    buyer={buyer}
                    productId={product.id}
                    agreement={agreed[i]?.data?.find((a) => a.productId === product.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BuyerRow({ buyer, productId, agreement }: { buyer: CatalogueBuyer; productId: string; agreement: AgreedPrice | undefined }) {
  const t = useTranslations("buyerPrices");
  const tc = useTranslations("common");
  const errorText = useCatalogueErrorText();
  const { organization } = useBusiness();
  const m = useAgreedPriceMutations(productId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string>();
  const name = buyer.partner?.displayName ?? t("unnamed");
  const relationshipId = buyer.relationship.id;
  const busy = m.set.isPending || m.remove.isPending;

  const save = () => {
    const price = parsePriceInput(value);
    if (!price) return setProblem(t("priceInvalid"));
    m.set.mutate(
      { relationshipId, body: { unitPrice: price, expectedRevision: agreement?.revision ?? null } },
      {
        onSuccess: () => {
          toast.success(t("saved", { buyer: name }));
          setEditing(false);
        },
        onError: (e) => setProblem(errorText(e)),
      },
    );
  };

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span>{name}</span>
          {agreement?.confirmationRequired && (
            <Badge variant="warning" title={t("awaitingHint")}>
              {t("awaitingConfirmation")}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        {editing ? (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center justify-end gap-2">
              <InputGroup className="w-36">
                <InputGroupInput
                  inputMode="decimal"
                  className="font-mono"
                  autoFocus
                  aria-label={t("editAria", { buyer: name })}
                  aria-invalid={!!problem || undefined}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setProblem(undefined);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault(); // this card sits inside the product form
                      save();
                    }
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{currencySymbol(organization.currency)}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <Button type="button" size="sm" disabled={busy} onClick={save}>
                {m.set.isPending && <Spinner data-icon="inline-start" />}
                {t("save")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {tc("cancel")}
              </Button>
            </div>
            {problem && <FieldError>{problem}</FieldError>}
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            {agreement ? (
              <span className="font-mono tabular-nums">{formatMoney(agreement.unitPrice, organization.currency)}</span>
            ) : (
              <span className="text-muted-foreground">{t("basePrice")}</span>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={t("editAria", { buyer: name })}
              onClick={() => {
                setValue(priceToInput(agreement?.unitPrice));
                setProblem(undefined);
                setEditing(true);
              }}
            >
              {t("edit")}
            </Button>
            {agreement && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={t("removeAria", { buyer: name })}
                disabled={busy}
                onClick={() =>
                  m.remove.mutate(
                    { relationshipId, expectedRevision: agreement.revision },
                    { onSuccess: () => toast.success(t("removed", { buyer: name })), onError: (e) => toast.error(errorText(e)) },
                  )
                }
              >
                {t("remove")}
              </Button>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
