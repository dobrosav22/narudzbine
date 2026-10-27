"use client";

import { Suspense } from "react";
import { OrdersScreen } from "@/features/orders/orders-screen";

export default function BuyerOrdersPage() {
  // useSearchParams (filter deep links) needs a Suspense boundary.
  return (
    <Suspense>
      <OrdersScreen />
    </Suspense>
  );
}
