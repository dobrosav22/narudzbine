"use client";

import { use } from "react";
import { AdminOrganizationDetailScreen } from "@/features/admin/organization-detail-screen";

export default function AdminOrganizationPage({ params }: PageProps<"/admin/organizations/[organizationId]">) {
  const { organizationId } = use(params);
  return <AdminOrganizationDetailScreen key={organizationId} organizationId={organizationId} />;
}
