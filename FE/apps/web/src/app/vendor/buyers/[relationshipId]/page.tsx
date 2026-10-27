"use client";

import { use } from "react";
import { VendorBuyerDetailScreen } from "@/features/trading/vendor-buyer-detail-screen";

export default function VendorBuyerPage({ params }: PageProps<"/vendor/buyers/[relationshipId]">) {
  const { relationshipId } = use(params);
  return <VendorBuyerDetailScreen relationshipId={relationshipId} />;
}
