"use client";

import { VendorOrdersScreen } from "@/features/vendor-orders/orders-screen";
import { useSignedIn } from "@/lib/session";

export default function VendorOrdersPage() {
  const { membership } = useSignedIn();
  return <VendorOrdersScreen vendorOrgId={membership.org.id} />;
}
