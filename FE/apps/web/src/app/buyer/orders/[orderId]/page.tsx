"use client";

import { Suspense, use } from "react";
import { RowsSkeleton } from "@/components/query-states";
import { OrderDetailScreen } from "@/features/orders/order-detail-screen";

export default function BuyerOrderPage({ params }: PageProps<"/buyer/orders/[orderId]">) {
  const { orderId } = use(params);
  // useSearchParams (?placed=1) needs a Suspense boundary.
  return (
    <Suspense fallback={<RowsSkeleton rows={6} />}>
      <OrderDetailScreen orderId={orderId} />
    </Suspense>
  );
}
