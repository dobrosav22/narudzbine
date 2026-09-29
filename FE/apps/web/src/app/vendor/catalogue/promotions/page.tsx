"use client";

import { PromotionsScreen } from "@/features/merchandising/promotions-screen";
import { useSignedIn } from "@/lib/session";

export default function VendorPromotionsPage() {
  const { membership } = useSignedIn();
  return <PromotionsScreen vendorOrgId={membership.org.id} />;
}
