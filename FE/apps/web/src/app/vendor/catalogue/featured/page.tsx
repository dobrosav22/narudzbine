"use client";

import { FeaturedScreen } from "@/features/merchandising/featured-screen";
import { useSignedIn } from "@/lib/session";

export default function VendorFeaturedPage() {
  const { membership } = useSignedIn();
  return <FeaturedScreen vendorOrgId={membership.org.id} />;
}
