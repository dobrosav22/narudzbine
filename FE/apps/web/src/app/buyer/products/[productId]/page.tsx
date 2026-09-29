"use client";

import { use } from "react";
import { ProductDetailScreen } from "@/features/buyer-catalogue/product-detail-screen";

export default function BuyerProductPage({ params }: PageProps<"/buyer/products/[productId]">) {
  const { productId } = use(params);
  return <ProductDetailScreen productId={productId} />;
}
