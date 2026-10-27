"use client";

import { useState } from "react";
import { BanIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { canSubmitOrCancel, orderActions, type Order, type OrderViewer } from "@repo/core";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "./reason-dialog";
import { useCancelOrder, useRequestCancellation } from "./queries";
import { ReorderButton } from "./reorder-button";

type Dialog = "cancel" | "request" | null;

/**
 * Buyer controls: direct cancellation before acceptance, a cancellation request after acceptance
 * (before dispatch), reorder preparation (read-only preview → local cart) and, for a cancelled
 * order, a replacement order. The buyer-wide staff restriction hides submit/cancel controls.
 */
export function BuyerOrderActions({ order, viewer }: { order: Order; viewer: OrderViewer }) {
  const t = useTranslations("orders.buyerActions");
  const actions = orderActions(order, viewer);
  const [dialog, setDialog] = useState<Dialog>(null);
  const cancel = useCancelOrder();
  const request = useRequestCancellation();
  const ref = { orderId: order.id, expectedRevision: order.revision };
  const restricted = !canSubmitOrCancel(viewer) && (order.state === "AWAITING_ACCEPTANCE" || order.state === "ACCEPTED");
  const close = () => {
    setDialog(null);
    cancel.reset();
    request.reset();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {actions.reorder && <ReorderButton order={order} />}
        {actions.replace && <ReorderButton order={order} replacement />}
        {actions.requestCancellation && (
          <Button variant="outline" onClick={() => setDialog("request")}>
            <BanIcon data-icon="inline-start" />
            {t("requestCancellation")}
          </Button>
        )}
        {actions.cancel && (
          <Button variant="destructive" onClick={() => setDialog("cancel")}>
            <XCircleIcon data-icon="inline-start" />
            {t("cancel")}
          </Button>
        )}
      </div>
      {restricted && <p className="text-sm text-muted-foreground">{t("restricted")}</p>}

      <ReasonDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => (o ? setDialog("cancel") : close())}
        title={t("cancelTitle", { number: order.number })}
        description={t("cancelDescription", { vendor: order.vendor.displayName })}
        confirmLabel={t("cancel")}
        destructive
        pending={cancel.isPending}
        error={cancel.error}
        onConfirm={(reason) =>
          cancel.mutate(
            { ...ref, reason },
            {
              onSuccess: () => {
                toast.success(t("cancelled", { number: order.number }));
                setDialog(null);
              },
            },
          )
        }
      />
      <ReasonDialog
        open={dialog === "request"}
        onOpenChange={(o) => (o ? setDialog("request") : close())}
        title={t("requestTitle", { number: order.number })}
        description={t("requestDescription", { vendor: order.vendor.displayName })}
        confirmLabel={t("requestCancellation")}
        pending={request.isPending}
        error={request.error}
        onConfirm={(reason) =>
          request.mutate(
            { ...ref, reason },
            {
              onSuccess: () => {
                toast.success(t("requested"));
                setDialog(null);
              },
            },
          )
        }
      />
    </div>
  );
}
