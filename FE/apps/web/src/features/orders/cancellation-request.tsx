"use client";

import { useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { formatDateTime, orderActions, type Order, type OrderViewer } from "@repo/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionError } from "./action-error";
import { ConfirmDialog } from "./confirm-dialog";
import { useApproveCancellation, useCancellationRequest, useRejectCancellation, useWithdrawCancellation } from "./queries";
import { ReasonDialog } from "./reason-dialog";

type Dialog = "approve" | "decline" | "withdraw" | null;

/**
 * The pending cancellation request of an accepted order (Order.cancellationRequestId is
 * pending-only). Resolution uses the REQUEST revision: the buyer may withdraw, the vendor approves
 * (cancels with the request reason) or declines with a reason. Past requests are in the timeline.
 */
export function CancellationRequestPanel({ order, viewer }: { order: Order; viewer: OrderViewer }) {
  const t = useTranslations("orders.request");
  const request = useCancellationRequest(order.id, order.cancellationRequestId);
  const withdraw = useWithdrawCancellation();
  const approve = useApproveCancellation();
  const decline = useRejectCancellation();
  const [dialog, setDialog] = useState<Dialog>(null);
  if (!order.cancellationRequestId) return null;
  const actions = orderActions(order, viewer);
  const close = () => {
    setDialog(null);
    withdraw.reset();
    approve.reset();
    decline.reset();
  };

  if (request.isError) return <ActionError error={request.error} />;
  if (!request.data) return <Skeleton className="h-20 w-full" />;
  const r = request.data;
  const ref = { orderId: order.id, requestId: r.id, expectedRevision: r.revision };
  const done = (message: string) => () => {
    toast.success(message);
    setDialog(null);
  };

  return (
    <Alert>
      <CircleAlertIcon />
      <AlertTitle>{viewer.side === "VENDOR" ? t("titleVendor", { buyer: order.buyer.displayName }) : t("titleBuyer")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p className="whitespace-pre-wrap">{t("reason", { reason: r.reason, when: formatDateTime(r.createdAt) })}</p>
        <p>{viewer.side === "VENDOR" ? t("vendorHint") : t("buyerHint")}</p>
        <div className="flex flex-wrap gap-2">
          {actions.approveCancellation && (
            <Button variant="destructive" size="sm" onClick={() => setDialog("approve")}>
              {t("approve")}
            </Button>
          )}
          {actions.rejectCancellation && (
            <Button variant="outline" size="sm" onClick={() => setDialog("decline")}>
              {t("decline")}
            </Button>
          )}
          {actions.withdrawCancellation && (
            <Button variant="outline" size="sm" onClick={() => setDialog("withdraw")}>
              {t("withdraw")}
            </Button>
          )}
        </div>
      </AlertDescription>

      <ConfirmDialog
        open={dialog === "approve"}
        onOpenChange={(o) => (o ? setDialog("approve") : close())}
        title={t("approveTitle", { number: order.number })}
        description={t("approveDescription")}
        confirmLabel={t("approve")}
        destructive
        pending={approve.isPending}
        error={approve.error}
        onConfirm={() => approve.mutate(ref, { onSuccess: done(t("approved", { number: order.number })) })}
      />
      <ReasonDialog
        open={dialog === "decline"}
        onOpenChange={(o) => (o ? setDialog("decline") : close())}
        title={t("declineTitle")}
        description={t("declineDescription", { buyer: order.buyer.displayName })}
        confirmLabel={t("decline")}
        pending={decline.isPending}
        error={decline.error}
        onConfirm={(reason) => decline.mutate({ ...ref, reason }, { onSuccess: done(t("declined")) })}
      />
      <ConfirmDialog
        open={dialog === "withdraw"}
        onOpenChange={(o) => (o ? setDialog("withdraw") : close())}
        title={t("withdrawTitle")}
        description={t("withdrawDescription", { vendor: order.vendor.displayName })}
        confirmLabel={t("withdraw")}
        pending={withdraw.isPending}
        error={withdraw.error}
        onConfirm={() => withdraw.mutate(ref, { onSuccess: done(t("withdrawn")) })}
      />
    </Alert>
  );
}
