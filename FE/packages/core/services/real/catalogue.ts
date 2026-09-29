import type { CatalogueService } from '../catalogue';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const catalogueService: CatalogueService = {
  listProducts: async () => notImplemented('catalogue.listProducts'),
  getProduct: async () => notImplemented('catalogue.getProduct'),
  createProduct: async () => notImplemented('catalogue.createProduct'),
  updateProduct: async () => notImplemented('catalogue.updateProduct'),
  deleteProduct: async () => notImplemented('catalogue.deleteProduct'),
  bulkUpdate: async () => notImplemented('catalogue.bulkUpdate'),
  listCategories: async () => notImplemented('catalogue.listCategories'),
  createCategory: async () => notImplemented('catalogue.createCategory'),
  deleteCategory: async () => notImplemented('catalogue.deleteCategory'),
  listTags: async () => notImplemented('catalogue.listTags'),
  createTag: async () => notImplemented('catalogue.createTag'),
  deleteTag: async () => notImplemented('catalogue.deleteTag'),
  listPriceTiers: async () => notImplemented('catalogue.listPriceTiers'),
  setPriceTiers: async () => notImplemented('catalogue.setPriceTiers'),
  uploadProductImage: async () => notImplemented('catalogue.uploadProductImage'),
};
