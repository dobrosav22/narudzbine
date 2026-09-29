"use client";

import { use } from "react";
import { BuyerDetailScreen } from "@/features/vendor-buyers/buyer-detail-screen";
import { useSignedIn } from "@/lib/session";

export default function VendorBuyerPage({ params }: PageProps<"/vendor/buyers/[buyerOrgId]">) {
  const { buyerOrgId } = use(params);
  const { membership } = useSignedIn();
  return <BuyerDetailScreen vendorOrgId={membership.org.id} buyerOrgId={buyerOrgId} />;
}
