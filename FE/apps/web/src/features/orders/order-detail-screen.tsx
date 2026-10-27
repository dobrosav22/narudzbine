"use client";

import { useSearchParams } from "next/navigation";
import { BuyerOrderActions } from "./buyer-actions";
import { OrderDetailLoader } from "./order-detail";

/** Buyer order detail: frozen snapshot, progress, cancellation, reorder/replacement, history, thread. */
export function OrderDetailScreen({ orderId }: { orderId: string }) {
  // Checkout lands here with ?placed=1 after a successful submission.
  const placed = useSearchParams().get("placed") === "1";
  return (
    <OrderDetailLoader
      orderId={orderId}
      listPath="/buyer/orders"
      placed={placed}
      actions={(order, viewer) => <BuyerOrderActions order={order} viewer={viewer} />}
    />
  );
}
