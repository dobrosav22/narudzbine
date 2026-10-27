"use client";

import { use } from "react";
import { VendorOrderDetailScreen } from "@/features/vendor-orders/order-detail-screen";

export default function VendorOrderPage({ params }: PageProps<"/vendor/orders/[orderId]">) {
  const { orderId } = use(params);
  return <VendorOrderDetailScreen orderId={orderId} />;
}
