// Mirrors 04-data-contract-api-outline.md → "Buyer conveniences".

export interface BuyerFavorite {
  id: string;
  buyerUserId: string; // [assumed] personal, not org-shared — confirm
  productId: string;
}

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface DraftCart {
  id: string;
  buyerOrgId: string;
  vendorOrgId: string;
  locationId?: string;
  createdByUserId: string;
  items: CartLine[];
  updatedAt: string;
}
