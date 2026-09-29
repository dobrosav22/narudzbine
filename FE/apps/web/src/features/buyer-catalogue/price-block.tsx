"use client";

import { formatMoney, priceNote, type ResolvedPrice } from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { useMsg } from "@/lib/i18n";

/** Price with the list price struck through when lower; the note ("Your price", "10% off") comes from core's priceNote. */
export function PriceBlock({
  price,
  unit,
  size = "default",
}: {
  price: ResolvedPrice;
  unit: string;
  size?: "default" | "lg";
}) {
  const tm = useMsg();
  const note = priceNote(price);
  const discounted = price.unitPrice < price.basePrice;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={`font-mono font-semibold tabular-nums ${size === "lg" ? "text-2xl" : "text-base"}`}>
          {formatMoney(price.unitPrice)}
        </span>
        <span className="text-sm text-muted-foreground">/ {unit}</span>
        {discounted && (
          <span className="font-mono text-sm text-muted-foreground tabular-nums line-through">
            {formatMoney(price.basePrice)}
          </span>
        )}
      </div>
      {note && <Badge variant={note.variant}>{tm(note.msg)}</Badge>}
    </div>
  );
}
