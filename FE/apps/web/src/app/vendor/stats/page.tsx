"use client";

import { VendorStatsScreen } from "@/features/stats/vendor-stats-screen";
import { useSignedIn } from "@/lib/session";

export default function VendorStatsPage() {
  const { membership } = useSignedIn();
  return <VendorStatsScreen vendorOrgId={membership.org.id} />;
}
