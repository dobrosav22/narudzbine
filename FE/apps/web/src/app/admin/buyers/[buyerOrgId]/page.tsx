"use client";

import { use } from "react";
import { AdminBuyerDetailScreen } from "@/features/admin/buyer-detail-screen";

export default function AdminBuyerPage({ params }: PageProps<"/admin/buyers/[buyerOrgId]">) {
  const { buyerOrgId } = use(params);
  return <AdminBuyerDetailScreen key={buyerOrgId} buyerOrgId={buyerOrgId} />;
}
