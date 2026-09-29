"use client";

import { use } from "react";
import { VendorOrderDetailScreen } from "@/features/vendor-orders/order-detail-screen";
import { useSignedIn } from "@/lib/session";

export default function VendorOrderPage({ params }: PageProps<"/vendor/orders/[orderId]">) {
  const { orderId } = use(params);
  const { membership } = useSignedIn();
  return <VendorOrderDetailScreen vendorOrgId={membership.org.id} orderId={orderId} />;
}
