"use client";

import { use } from "react";
import { ProductEditor } from "@/features/vendor-catalogue/product-editor";

export default function EditProductPage({ params }: PageProps<"/vendor/catalogue/[productId]">) {
  const { productId } = use(params);
  return <ProductEditor key={productId} productId={productId} />;
}
