"use client";

import { Suspense } from "react";
import { VendorOrdersScreen } from "@/features/vendor-orders/orders-screen";

export default function VendorOrdersPage() {
  // useSearchParams (filter deep links) needs a Suspense boundary.
  return (
    <Suspense>
      <VendorOrdersScreen />
    </Suspense>
  );
}
