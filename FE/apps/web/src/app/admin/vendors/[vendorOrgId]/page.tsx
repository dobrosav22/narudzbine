"use client";

import { use } from "react";
import { AdminVendorDetailScreen } from "@/features/admin/vendor-detail-screen";

export default function AdminVendorPage({ params }: PageProps<"/admin/vendors/[vendorOrgId]">) {
  const { vendorOrgId } = use(params);
  return <AdminVendorDetailScreen key={vendorOrgId} vendorOrgId={vendorOrgId} />;
}
