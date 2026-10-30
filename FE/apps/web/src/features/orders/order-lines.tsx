"use client";

import { useTranslations } from "next-intl";
import { formatMoney, formatNumber, formatPercent, type Order, type ReviewedLine } from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * The frozen order lines exactly as reviewed and submitted (ReviewedLine + PriceResolution): never
 * re-priced or re-resolved against the live catalogue. Amounts are NET_EXCLUDING_VAT strings.
 */
export function OrderLines({ order }: { order: Order }) {
  const t = useTranslations("orders");
  return (
    <Table stack className="text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>{t("product")}</TableHead>
          <TableHead className="text-right">{t("qty")}</TableHead>
          <TableHead className="text-right">{t("unitPrice")}</TableHead>
          <TableHead className="text-right">{t("lineTotal")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {order.lines.map((line, i) => (
          <TableRow key={`${line.productId}-${i}`}>
            <TableCell primary>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{line.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {line.packDescription ? `${line.sku} · ${line.packDescription}` : line.sku}
                </span>
              </div>
            </TableCell>
            <TableCell label={t("qty")} className="text-right font-mono tabular-nums whitespace-nowrap">
              {formatNumber(line.quantity)} <span className="text-muted-foreground">{line.unitName}</span>
            </TableCell>
            <TableCell label={t("unitPrice")} className="text-right">
              <UnitPrice line={line} currency={order.currency} />
            </TableCell>
            <TableCell label={t("lineTotal")} className="text-right font-mono tabular-nums">{formatMoney(line.price.lineTotal, order.currency)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>
            <span className="flex flex-col">
              <span>{t("goodsTotal")}</span>
              <span className="text-xs font-normal text-muted-foreground">{t("netNote")}</span>
            </span>
          </TableCell>
          <TableCell className="text-right font-mono tabular-nums">{formatMoney(order.goodsTotal, order.currency)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

/** Final unit price with how it was reached: base/normal (tier), agreed price, one promotion. */
function UnitPrice({ line, currency }: { line: ReviewedLine; currency: Order["currency"] }) {
  const t = useTranslations("orders");
  const p = line.price;
  const promo = p.appliedPromotion;
  // The price before the promotion: the agreed price wins over the tiered/base "normal" price.
  const beforePromotion = p.agreedUnitPrice ?? p.normalUnitPrice;
  return (
    <div className="flex flex-col items-end gap-1 group-data-stack/table:max-md:items-start">
      <span className="font-mono tabular-nums">{formatMoney(p.finalUnitPrice, currency)}</span>
      {beforePromotion !== p.finalUnitPrice && (
        <span className="font-mono text-xs text-muted-foreground line-through tabular-nums">{formatMoney(beforePromotion, currency)}</span>
      )}
      <div className="flex flex-wrap justify-end gap-1 group-data-stack/table:max-md:justify-start">
        {p.agreedUnitPrice !== null && <Badge variant="info">{t("agreedPrice")}</Badge>}
        {promo && (
          <Badge variant="success">
            {promo.kind === "PERCENTAGE"
              ? t("promotionPercent", { name: promo.name, value: formatPercent(promo.value) })
              : t("promotionFixed", { name: promo.name })}
          </Badge>
        )}
        {p.reachedTierThreshold !== null && p.agreedUnitPrice === null && (
          <Badge variant="secondary">{t("tierFrom", { quantity: formatNumber(p.reachedTierThreshold) })}</Badge>
        )}
      </div>
      {p.baseUnitPrice !== beforePromotion && (
        <span className="text-xs text-muted-foreground">{t("basePrice", { price: formatMoney(p.baseUnitPrice, currency) })}</span>
      )}
    </div>
  );
}
