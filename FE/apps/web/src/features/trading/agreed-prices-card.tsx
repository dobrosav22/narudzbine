"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatMoney, isApiError, type Currency, type Relationship } from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProblemAlert } from "./parts";
import { useAgreedPrices, useConfirmAgreedPrices, useOwnProductNames } from "./queries";

/**
 * Vendor-only: the buyer's agreed (negotiated) unit prices, read-only here — they are edited on
 * each product's page. After a reconnection every retained agreement is dormant until the
 * vendor reviews it: select the reviewed products and confirm with the pricing and relationship
 * revisions of the list snapshot being shown. A conflict means something changed: re-read and
 * review again (never a blind retry).
 */
export function AgreedPricesCard({ relationship, currency, partnerName }: { relationship: Relationship; currency: Currency; partnerName: string }) {
  const t = useTranslations("vendorBuyers.agreed");
  const tc = useTranslations("common");
  const prices = useAgreedPrices(relationship.id);
  const items = prices.data?.items ?? [];
  const names = useOwnProductNames(items.map((p) => p.productId));
  const confirm = useConfirmAgreedPrices();
  const pendingIds = items.filter((p) => p.confirmationRequired).map((p) => p.productId);
  const reviewing = relationship.state === "ACTIVE" && relationship.agreedPriceConfirmationRequired;
  // Everything awaiting review starts selected; a fresh snapshot (new pricing revision) resets the choice.
  const snapshotKey = prices.data?.pricingRevision;
  const [choice, setChoice] = useState<{ snapshot: string | undefined; ids: Set<string> }>();
  const selected = choice && choice.snapshot === snapshotKey ? choice.ids : new Set(pendingIds);
  const toggle = (productId: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(productId);
    else next.delete(productId);
    setChoice({ snapshot: snapshotKey, ids: next });
  };

  const submit = () => {
    if (!prices.data) return;
    confirm.mutate(
      {
        relationshipId: relationship.id,
        expectedRelationshipRevision: prices.data.relationshipRevision,
        expectedPricingRevision: prices.data.pricingRevision,
        productIds: pendingIds.filter((id) => selected.has(id)),
      },
      {
        onSuccess: () => toast.success(t("confirmed")),
        onError: (error) => {
          if (isApiError(error, "REVISION_CONFLICT")) void prices.refetch();
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {prices.isError ? (
          <ErrorState error={prices.error} onRetry={() => void prices.refetch()} />
        ) : prices.isPending ? (
          <RowsSkeleton rows={3} />
        ) : (
          <>
            {reviewing && (
              <Alert>
                <ClipboardCheckIcon />
                <AlertTitle>{t("reviewTitle")}</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-3">
                  <p>{items.length ? t("reviewDescription", { name: partnerName }) : t("reviewEmpty", { name: partnerName })}</p>
                  {confirm.error && <ProblemAlert error={confirm.error} />}
                  <Button size="sm" disabled={confirm.isPending || (pendingIds.length > 0 && selected.size === 0)} onClick={submit}>
                    {confirm.isPending && <Spinner data-icon="inline-start" />}
                    {items.length ? t("confirmSelected", { count: selected.size }) : t("confirmEmpty")}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty", { name: partnerName })}</p>
            ) : (
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    {reviewing && <TableHead className="w-10"><span className="sr-only">{t("select")}</span></TableHead>}
                    <TableHead>{t("product")}</TableHead>
                    <TableHead className="text-right">{t("unitPrice")}</TableHead>
                    <TableHead className="text-right">{t("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p) => {
                    const product = names.get(p.productId);
                    return (
                      <TableRow key={p.id}>
                        {reviewing && (
                          <TableCell>
                            {p.confirmationRequired && (
                              <Checkbox
                                checked={selected.has(p.productId)}
                                aria-label={t("selectProduct", { name: product?.name ?? p.productId })}
                                onCheckedChange={(on) => toggle(p.productId, on === true)}
                              />
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <Link href={`/vendor/catalogue/${p.productId}`} className="flex flex-col hover:underline">
                            <span className="font-medium">{product?.name ?? tc("dash")}</span>
                            {product && <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatMoney(p.unitPrice, currency)}</TableCell>
                        <TableCell className="text-right">
                          {p.confirmationRequired ? <Badge variant="warning">{t("dormant")}</Badge> : <Badge variant="success">{t("applies")}</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <p className="text-xs text-muted-foreground">{t("netNote")}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
