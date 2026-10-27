"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyPlusIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { formatNumber, orderQueries, type CartScope, type Order, type ReorderLine } from "@repo/core";
import { RowsSkeleton } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { cartStore, useCartFor, useReorderIntoCart } from "@/lib/cart";
import { useBusiness } from "@/lib/session";
import { ActionError } from "./action-error";

/**
 * Reorder (read-only GET /orders/{id}/reorder-preview → local cart) and, with `replacement`, the
 * entry point for a replacement of a CANCELLED order: the same preparation plus the cart's
 * `replacementForOrderId`, which checkout sends in the review intent. Nothing is created on the
 * backend until the buyer reviews and submits from the cart.
 */
export function ReorderButton({ order, replacement = false }: { order: Order; replacement?: boolean }) {
  const t = useTranslations("orders.reorder");
  const router = useRouter();
  const { organization } = useBusiness();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const scope: CartScope = useMemo(
    () => ({ buyerOrgId: organization.id, vendorId: order.vendor.organizationId }),
    [organization.id, order.vendor.organizationId],
  );
  const cart = useCartFor(open ? scope : undefined);
  const preview = useQuery({ ...orderQueries.reorderPreview(order.id), enabled: open });
  const reorderIntoCart = useReorderIntoCart();
  const lines = preview.data?.lines ?? [];
  const orderable = lines.filter((l) => l.currentOffer !== null).length;

  const confirm = async () => {
    if (!preview.data) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await reorderIntoCart(preview.data, { mode: cart.lines.length ? mode : "replace" });
      if (replacement) {
        // The replacement link travels with the cart even when no line is orderable right now.
        await cartStore.hydrate(scope);
        cartStore.updateDetails(scope, { replacementForOrderId: order.id });
      }
      const skipped = outcome.plan.unavailable.length;
      const added = outcome.plan.lines.length;
      toast.success(
        skipped
          ? t("addedSkipped", { count: added, countText: formatNumber(added), skipped: formatNumber(skipped) })
          : t("added", { count: added, countText: formatNumber(added) }),
      );
      if (outcome.vendorId || replacement) router.push("/buyer/cart");
      setOpen(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={replacement ? "default" : "outline"} onClick={() => setOpen(true)}>
        {replacement ? <CopyPlusIcon data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
        {replacement ? t("replacement") : t("reorder")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{replacement ? t("replacementTitle", { number: order.number }) : t("title", { number: order.number })}</DialogTitle>
            <DialogDescription>{replacement ? t("replacementDescription") : t("description")}</DialogDescription>
          </DialogHeader>
          {preview.isError ? (
            <ActionError error={preview.error} />
          ) : preview.isPending ? (
            <RowsSkeleton rows={3} />
          ) : (
            <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border text-sm">
              {lines.map((l, i) => (
                <PreviewLine key={`${l.original.productId}-${i}`} line={l} />
              ))}
            </ul>
          )}
          {preview.data && orderable === 0 && <p className="text-sm text-muted-foreground">{t("nothingAvailable")}</p>}
          {cart.lines.length > 0 && orderable > 0 && (
            <Field>
              <FieldLabel>{t("existingCart", { count: cart.lines.length, countText: formatNumber(cart.lines.length) })}</FieldLabel>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as "merge" | "replace")}>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="merge" />
                  {t("merge")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="replace" />
                  {t("replace")}
                </label>
              </RadioGroup>
            </Field>
          )}
          <ActionError error={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("close")}
            </Button>
            <Button disabled={!preview.data || busy || (orderable === 0 && !replacement)} onClick={() => void confirm()}>
              {busy && <Spinner data-icon="inline-start" />}
              {t("toCart")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreviewLine({ line }: { line: ReorderLine }) {
  const t = useTranslations("orders.reorder");
  const changes = line.changes.filter((c) => c !== "UNAVAILABLE");
  return (
    <li className="flex items-start justify-between gap-3 p-3">
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">{line.original.name}</span>
        <span className="font-mono text-xs text-muted-foreground">{`${formatNumber(line.original.quantity)} ${line.original.unitName} · ${line.original.sku}`}</span>
        {changes.length > 0 && (
          <span className="text-xs text-muted-foreground">{changes.map((c) => t(`change.${c}`)).join(" · ")}</span>
        )}
      </div>
      {line.currentOffer === null ? (
        <Badge variant="destructive">{t("unavailable")}</Badge>
      ) : line.available ? (
        <Badge variant="success">{t("available")}</Badge>
      ) : (
        <Badge variant="warning">{t("check")}</Badge>
      )}
    </li>
  );
}
