"use client";

import { ProductEditor } from "@/features/vendor-catalogue/product-editor";
import { useSignedIn } from "@/lib/session";

export default function NewProductPage() {
  const { membership } = useSignedIn();
  return <ProductEditor vendorOrgId={membership.org.id} />;
}
