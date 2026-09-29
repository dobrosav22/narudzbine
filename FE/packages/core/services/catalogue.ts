import type {
  BulkUpdateProductsInput,
  Category,
  CreateCategoryInput,
  CreateProductInput,
  CreateTagInput,
  ListProductsParams,
  PriceTier,
  PriceTierInput,
  Product,
  Tag,
  UpdateProductInput,
  UploadProductImageInput,
} from '../types';

export interface CatalogueService {
  listProducts(params: ListProductsParams): Promise<Product[]>;
  getProduct(productId: string): Promise<Product>;
  /** Throws PLAN_LIMIT when the vendor's tier maxProducts is reached. */
  createProduct(input: CreateProductInput): Promise<Product>;
  updateProduct(productId: string, patch: UpdateProductInput): Promise<Product>;
  deleteProduct(productId: string): Promise<void>;
  bulkUpdate(input: BulkUpdateProductsInput): Promise<Product[]>;

  listCategories(vendorOrgId: string): Promise<Category[]>;
  createCategory(input: CreateCategoryInput): Promise<Category>;
  deleteCategory(categoryId: string): Promise<void>;

  listTags(vendorOrgId: string): Promise<Tag[]>;
  createTag(input: CreateTagInput): Promise<Tag>;
  deleteTag(tagId: string): Promise<void>;

  /** GET /products/:id/price-tiers */
  listPriceTiers(productId: string): Promise<PriceTier[]>;
  /** Replaces the product's whole tier list (simpler than per-tier POST/DELETE for the edit form). */
  setPriceTiers(productId: string, tiers: PriceTierInput[]): Promise<PriceTier[]>;

  /** [assumed] Not in 04 — returns the URL to store as Product.imageUrl. VALIDATION for a wrong type or size. */
  uploadProductImage(input: UploadProductImageInput): Promise<{ url: string }>;
}
