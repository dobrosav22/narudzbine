"use client";

import { Suspense } from "react";
import { InventoryScreen } from "@/features/vendor-catalogue/inventory-screen";

export default function InventoryPage() {
  // useSearchParams (the review id lives in the URL) needs a Suspense boundary.
  return (
    <Suspense>
      <InventoryScreen />
    </Suspense>
  );
}
