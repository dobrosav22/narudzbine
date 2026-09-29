// Mirrors 04-data-contract-api-outline.md → "Merchandising".

export interface FeaturedProduct {
  id: string;
  vendorOrgId: string;
  productId: string;
  position: number;
}

export interface Promotion {
  id: string;
  vendorOrgId: string;
  type: 'percentage' | 'fixed';
  value: number;
  scope: 'all' | 'category' | 'product' | 'buyer';
  scopeIds: string[]; // ids matching the scope type
  startDate: string;
  endDate: string;
  isActive: boolean;
}
