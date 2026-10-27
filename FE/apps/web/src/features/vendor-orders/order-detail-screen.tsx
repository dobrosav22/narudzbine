"use client";

import { OrderDetailLoader } from "@/features/orders/order-detail";
import { VendorOrderActions } from "./vendor-actions";

/** Vendor order detail: frozen snapshot, lifecycle actions, custom stage, history, thread. */
export function VendorOrderDetailScreen({ orderId }: { orderId: string }) {
  return (
    <OrderDetailLoader
      orderId={orderId}
      listPath="/vendor/orders"
      actions={(order, viewer) => <VendorOrderActions order={order} role={viewer.role} />}
    />
  );
}
