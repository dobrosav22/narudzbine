// Mirrors 04-data-contract-api-outline.md → "Catalogue".

export interface Category {
  id: string;
  vendorOrgId: string;
  name: string;
  parentCategoryId?: string; // [assumed] hierarchy support; may end up flat-only
}

export interface Tag {
  id: string;
  vendorOrgId: string;
  name: string;
}

export interface Product {
  id: string;
  vendorOrgId: string;
  name: string;
  sku: string;
  description?: string;
  categoryId?: string;
  tagIds: string[];
  basePrice: number;
  unit: string; // e.g. "case", "roll"
  stock?: number; // present only if VendorOrg.tracksInventory
  minOrderQuantity?: number;
  imageUrl?: string;
  isActive: boolean;
}

export interface PriceTier {
  id: string;
  productId: string;
  minQty: number;
  pricePerUnit: number;
}

/** Per-buyer negotiated override. */
export interface BuyerProductPrice {
  id: string;
  vendorOrgId: string;
  buyerOrgId: string;
  productId: string;
  price: number;
}
