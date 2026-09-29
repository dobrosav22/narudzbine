import { formatNumber } from '../helpers';
import type { CatalogueService } from '../services';
import type { Product } from '../types';
import { serviceError } from '../errors';
import { roundMoney } from '../pricing';
import { productImageProblem } from '../catalogue/productImage';
import { db } from './db';
import { tierById, usageFor } from './orgs';
import { clone, delay, findOrThrow, newId } from './util';

function tracksInventory(vendorOrgId: string): boolean {
  return db.vendorOrgs.find((o) => o.id === vendorOrgId)?.tracksInventory ?? false;
}

function validateProduct(p: Product): void {
  if (!p.name.trim()) throw serviceError('VALIDATION', 'errors.productNameRequired');
  if (!p.sku.trim()) throw serviceError('VALIDATION', 'errors.skuRequired');
  if (!(p.basePrice >= 0)) throw serviceError('VALIDATION', 'errors.priceNegative');
  if (p.minOrderQuantity !== undefined && p.minOrderQuantity < 1)
    throw serviceError('VALIDATION', 'errors.minOrderTooLow');
  const clash = db.products.find((o) => o.vendorOrgId === p.vendorOrgId && o.id !== p.id && o.sku.toLowerCase() === p.sku.toLowerCase());
  if (clash) throw serviceError('CONFLICT', 'errors.skuTaken', { sku: p.sku, product: clash.name });
  // Stock only exists when the vendor tracks inventory (01 §3).
  if (!tracksInventory(p.vendorOrgId)) delete p.stock;
}

export const catalogueService: CatalogueService = {
  async listProducts({ vendorOrgId, search, categoryId, tagIds, includeInactive }) {
    await delay();
    const q = search?.trim().toLowerCase();
    return clone(
      db.products
        .filter((p) => p.vendorOrgId === vendorOrgId)
        .filter((p) => includeInactive || p.isActive)
        .filter((p) => !categoryId || p.categoryId === categoryId)
        .filter((p) => !tagIds?.length || tagIds.every((t) => p.tagIds.includes(t)))
        .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  },

  async getProduct(productId) {
    await delay();
    return clone(findOrThrow(db.products, (p) => p.id === productId, 'Product'));
  },

  async createProduct(input) {
    await delay();
    // Hard limit (v1.1): the UI disables Add Product first; this is the server-side backstop.
    const usage = usageFor(input.vendorOrgId);
    if (usage.productCount >= usage.maxProducts) {
      throw serviceError('PLAN_LIMIT', 'errors.planLimitProducts', { plan: tierById(usage.tierId).name, count: usage.maxProducts, countText: formatNumber(usage.maxProducts) }, {
        limit: 'products',
        max: usage.maxProducts,
      });
    }
    const product: Product = { ...clone(input), id: newId('p') };
    validateProduct(product);
    db.products.push(product);
    return clone(product);
  },

  async updateProduct(productId, patch) {
    await delay();
    const product = findOrThrow(db.products, (p) => p.id === productId, 'Product');
    const next = { ...product, ...clone(patch) };
    validateProduct(next);
    Object.assign(product, next);
    return clone(product);
  },

  async deleteProduct(productId) {
    await delay();
    findOrThrow(db.products, (p) => p.id === productId, 'Product');
    db.products = db.products.filter((p) => p.id !== productId);
    db.priceTiers = db.priceTiers.filter((t) => t.productId !== productId);
    db.buyerPrices = db.buyerPrices.filter((b) => b.productId !== productId);
    db.featured = db.featured.filter((f) => f.productId !== productId);
    // Past orders keep their line items — they reference a snapshot price, not the live product.
  },

  async bulkUpdate(input) {
    await delay();
    const targets = db.products.filter((p) => p.vendorOrgId === input.vendorOrgId && input.productIds.includes(p.id));
    for (const p of targets) {
      if (input.price?.kind === 'set') p.basePrice = roundMoney(input.price.value);
      if (input.price?.kind === 'percent') p.basePrice = roundMoney(p.basePrice * (1 + input.price.value / 100));
      if (input.addTagIds) p.tagIds = [...new Set([...p.tagIds, ...input.addTagIds])];
      if (input.removeTagIds) p.tagIds = p.tagIds.filter((t) => !input.removeTagIds!.includes(t));
      if (input.categoryId === null) delete p.categoryId;
      else if (input.categoryId !== undefined) p.categoryId = input.categoryId;
      if (input.isActive !== undefined) p.isActive = input.isActive;
      if (p.basePrice < 0) p.basePrice = 0;
    }
    return clone(targets);
  },

  async listCategories(vendorOrgId) {
    await delay();
    return clone(db.categories.filter((c) => c.vendorOrgId === vendorOrgId).sort((a, b) => a.name.localeCompare(b.name)));
  },
  async createCategory(input) {
    await delay();
    if (!input.name.trim()) throw serviceError('VALIDATION', 'errors.categoryNameRequired');
    if (db.categories.some((c) => c.vendorOrgId === input.vendorOrgId && c.name.toLowerCase() === input.name.trim().toLowerCase()))
      throw serviceError('CONFLICT', 'errors.categoryTaken');
    const category = { ...input, name: input.name.trim(), id: newId('cat') };
    db.categories.push(category);
    return clone(category);
  },
  async deleteCategory(categoryId) {
    await delay();
    db.categories = db.categories.filter((c) => c.id !== categoryId);
    for (const p of db.products) if (p.categoryId === categoryId) delete p.categoryId;
  },

  async listTags(vendorOrgId) {
    await delay();
    return clone(db.tags.filter((t) => t.vendorOrgId === vendorOrgId).sort((a, b) => a.name.localeCompare(b.name)));
  },
  async createTag(input) {
    await delay();
    if (!input.name.trim()) throw serviceError('VALIDATION', 'errors.tagNameRequired');
    if (db.tags.some((t) => t.vendorOrgId === input.vendorOrgId && t.name.toLowerCase() === input.name.trim().toLowerCase()))
      throw serviceError('CONFLICT', 'errors.tagTaken');
    const tag = { ...input, name: input.name.trim(), id: newId('tag') };
    db.tags.push(tag);
    return clone(tag);
  },
  async deleteTag(tagId) {
    await delay();
    db.tags = db.tags.filter((t) => t.id !== tagId);
    for (const p of db.products) p.tagIds = p.tagIds.filter((t) => t !== tagId);
  },

  async listPriceTiers(productId) {
    await delay();
    return clone(db.priceTiers.filter((t) => t.productId === productId).sort((a, b) => a.minQty - b.minQty));
  },
  async setPriceTiers(productId, tiers) {
    await delay();
    findOrThrow(db.products, (p) => p.id === productId, 'Product');
    const qtys = new Set<number>();
    for (const t of tiers) {
      if (!Number.isInteger(t.minQty) || t.minQty < 2) throw serviceError('VALIDATION', 'errors.tierQtyInvalid');
      if (!(t.pricePerUnit >= 0)) throw serviceError('VALIDATION', 'errors.tierPriceNegative');
      if (qtys.has(t.minQty)) throw serviceError('VALIDATION', 'errors.tierDuplicate', { qty: formatNumber(t.minQty) });
      qtys.add(t.minQty);
    }
    const next = tiers
      .map((t) => ({ id: newId('pt'), productId, minQty: t.minQty, pricePerUnit: roundMoney(t.pricePerUnit) }))
      .sort((a, b) => a.minQty - b.minQty);
    db.priceTiers = [...db.priceTiers.filter((t) => t.productId !== productId), ...next];
    return clone(next);
  },

  async uploadProductImage({ vendorOrgId, uri, mimeType, sizeBytes }) {
    await delay(300);
    findOrThrow(db.vendorOrgs, (o) => o.id === vendorOrgId, 'Vendor');
    const problem = productImageProblem({ mimeType, sizeBytes });
    if (problem) throw serviceError('VALIDATION', problem.key, problem.values);
    // No storage while mocked: the local reference is the URL (lives as long as the tab/app session).
    return { url: uri };
  },
};
