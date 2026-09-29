// Input/param shapes for service calls. Kept here (not beside each service)
// so a contract change is a one-folder edit.
import type { Product, Category, Tag, PriceTier } from './catalogue';
import type { Promotion } from './merchandising';

import type { CartLine } from './buyer';
import type { OrgType } from './orgs';

export interface ListProductsParams {
  vendorOrgId: string;
  search?: string;
  categoryId?: string;
  tagIds?: string[];
  /** Vendor catalogue view wants inactive too; buyer browse never does. */
  includeInactive?: boolean;
}

export type CreateProductInput = Omit<Product, 'id'>;
export type UpdateProductInput = Partial<Omit<Product, 'id' | 'vendorOrgId'>>;

export interface BulkUpdateProductsInput {
  vendorOrgId: string;
  productIds: string[];
  /** Absolute price, or percentage change e.g. { kind: 'percent', value: 5 } = +5%. */
  price?: { kind: 'set'; value: number } | { kind: 'percent'; value: number };
  addTagIds?: string[];
  removeTagIds?: string[];
  categoryId?: string | null;
  isActive?: boolean;
}

export type CreateCategoryInput = Omit<Category, 'id'>;
export type CreateTagInput = Omit<Tag, 'id'>;
export type PriceTierInput = Omit<PriceTier, 'id' | 'productId'>;

export type CreatePromotionInput = Omit<Promotion, 'id'>;
export type UpdatePromotionInput = Partial<Omit<Promotion, 'id' | 'vendorOrgId'>>;

export interface ListOrdersParams {
  vendorOrgId?: string;
  buyerOrgId?: string;
  locationId?: string;
  statusKey?: string;
  /** ISO date strings, inclusive. */
  from?: string;
  to?: string;
}

export interface CreateOrderInput {
  vendorOrgId: string;
  buyerOrgId: string;
  locationId: string;
  createdByUserId: string;
  items: CartLine[];
  fulfillingLocationId?: string;
  /** If the order came from a parked draft, it is removed on success. [assumed] */
  fromDraftCartId?: string;
}

/** POST /orders/:id/reorder → "a new cart payload with re-resolved prices". */
export interface ReorderResult {
  sourceOrderId: string;
  vendorOrgId: string;
  locationId: string;
  items: CartLine[];
  /** Products from the old order that no longer exist or are inactive. */
  unavailableProductIds: string[];
}


export interface SaveDraftCartInput {
  id?: string; // omit to create
  buyerOrgId: string;
  vendorOrgId: string;
  locationId?: string;
  createdByUserId: string;
  items: CartLine[];
}

export interface LocationInput {
  name: string;
  address: string;
}

export interface CreateBuyerOrgInviteInput {
  vendorOrgId: string;
  email: string;
}

export interface CreateTeamInviteInput {
  targetOrgId: string;
  targetOrgType: OrgType;
  email: string;
}


/**
 * [assumed] 04 has Product.imageUrl but no upload endpoint. The apps hand over a local
 * reference to the picked file (a data: URL on web, a file:// URI on mobile); the service
 * stores it and answers with the URL to save as imageUrl.
 */
export interface UploadProductImageInput {
  vendorOrgId: string;
  uri: string;
  mimeType: string;
  sizeBytes?: number;
}
