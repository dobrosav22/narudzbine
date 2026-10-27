"use client";

import { use } from "react";
import { BuyerVendorDetailScreen } from "@/features/trading/buyer-vendor-detail-screen";

export default function BuyerVendorPage({ params }: PageProps<"/buyer/vendors/[relationshipId]">) {
  const { relationshipId } = use(params);
  return <BuyerVendorDetailScreen relationshipId={relationshipId} />;
}
