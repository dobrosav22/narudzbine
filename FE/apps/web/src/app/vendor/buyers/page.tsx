"use client";

import { BuyersScreen } from "@/features/vendor-buyers/buyers-screen";
import { useSignedIn } from "@/lib/session";

export default function VendorBuyersPage() {
  const { membership } = useSignedIn();
  return <BuyersScreen vendorOrgId={membership.org.id} />;
}
