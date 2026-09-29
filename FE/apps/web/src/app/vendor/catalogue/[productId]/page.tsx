"use client";

import { use } from "react";
import { ProductEditor } from "@/features/vendor-catalogue/product-editor";
import { useSignedIn } from "@/lib/session";

export default function EditProductPage({ params }: PageProps<"/vendor/catalogue/[productId]">) {
  const { productId } = use(params);
  const { membership } = useSignedIn();
  return <ProductEditor vendorOrgId={membership.org.id} productId={productId} />;
}
