/**
 * Buyer-side catalogue loading shared by apps/web and apps/mobile (03 → buyer
 * "Catalogue browse", "Product detail", "Cart"). Every price shown to a buyer
 * comes from services.pricing — never computed in a screen — so a server-side
 * resolver can replace the mock one without touching UI.
 */
import type { AppServices } from '../services';
import type { CartLine, PriceTier, Product, ResolvedPrice } from '../types';
import { roundMoney } from '../pricing';
import { formatMoney, formatPercent } from '../helpers';
import { msg, type Msg } from '../i18n/message';

type Deps = Pick<AppServices, 'catalogue' | 'pricing' | 'merchandising' | 'stats'>;

export interface CatalogueItem {
  product: Product;
  /** Resolved for this buyer at the product's default (minimum) order quantity. */
  price: ResolvedPrice;
}

export interface MostOrderedCatalogueItem extends CatalogueItem {
  orderCount: number;
  totalQuantity: number;
}

/** First quantity a buyer can order: the minimum order quantity, else 1. */
export function defaultQuantity(product: Pick<Product, 'minOrderQuantity'>): number {
  return Math.max(1, product.minOrderQuantity ?? 1);
}

/** Clamp a typed/stepped quantity to a whole number ≥ the minimum order (0 = remove). */
export function normalizeQuantity(quantity: number, product: Pick<Product, 'minOrderQuantity'>): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.max(defaultQuantity(product), Math.floor(quantity));
}

async function priceAll(deps: Deps, vendorOrgId: string, buyerOrgId: string, products: Product[]): Promise<CatalogueItem[]> {
  if (products.length === 0) return [];
  const prices = await deps.pricing.resolvePrices({
    vendorOrgId,
    buyerOrgId,
    items: products.map((p) => ({ productId: p.id, quantity: defaultQuantity(p) })),
  });
  const byId = new Map(prices.map((r) => [r.productId, r]));
  return products.flatMap((product) => {
    const price = byId.get(product.id);
    return price ? [{ product, price }] : [];
  });
}

/** Active products only (buyers never see inactive ones), price-resolved for this buyer. */
export async function loadBuyerCatalogue(
  deps: Deps,
  params: { vendorOrgId: string; buyerOrgId: string; search?: string; categoryId?: string; tagIds?: string[] },
): Promise<CatalogueItem[]> {
  const products = await deps.catalogue.listProducts({
    vendorOrgId: params.vendorOrgId,
    search: params.search || undefined,
    categoryId: params.categoryId,
    tagIds: params.tagIds?.length ? params.tagIds : undefined,
  });
  return priceAll(deps, params.vendorOrgId, params.buyerOrgId, products);
}

/**
 * Home shelves: vendor-curated featured list (in the vendor's order) and the
 * buyer's own most-ordered products (derived from order history, 01 §6).
 * Inactive or deleted products drop out of both.
 */
export async function loadBuyerShelves(
  deps: Deps,
  params: { vendorOrgId: string; buyerOrgId: string },
): Promise<{ featured: CatalogueItem[]; mostOrdered: MostOrderedCatalogueItem[] }> {
  const [featured, mostOrdered, products] = await Promise.all([
    deps.merchandising.listFeatured(params.vendorOrgId),
    deps.stats.getMostOrdered(params.buyerOrgId, params.vendorOrgId, 8),
    deps.catalogue.listProducts({ vendorOrgId: params.vendorOrgId }),
  ]);
  const active = new Map(products.map((p) => [p.id, p]));
  const featuredProducts = [...featured]
    .sort((a, b) => a.position - b.position)
    .flatMap((f) => (active.has(f.productId) ? [active.get(f.productId)!] : []));
  const mostOrderedActive = mostOrdered.filter((m) => active.has(m.product.id));

  const priced = await priceAll(deps, params.vendorOrgId, params.buyerOrgId, [
    ...new Map([...featuredProducts, ...mostOrderedActive.map((m) => active.get(m.product.id)!)].map((p) => [p.id, p])).values(),
  ]);
  const priceOf = new Map(priced.map((i) => [i.product.id, i.price]));
  return {
    featured: featuredProducts.flatMap((p) => (priceOf.has(p.id) ? [{ product: p, price: priceOf.get(p.id)! }] : [])),
    mostOrdered: mostOrderedActive.flatMap((m) => {
      const product = active.get(m.product.id)!;
      const price = priceOf.get(product.id);
      return price ? [{ product, price, orderCount: m.orderCount, totalQuantity: m.totalQuantity }] : [];
    }),
  };
}

export interface ProductDetail {
  product: Product;
  tiers: PriceTier[];
  /** Resolved at each tier's starting quantity (promotions included) — what the tier table shows. */
  tierPrices: ResolvedPrice[];
  /** Resolved at the default quantity. */
  price: ResolvedPrice;
}

/** Product detail for a buyer. null for another vendor's or an inactive product; NOT_FOUND (thrown) if deleted. */
export async function loadProductDetail(
  deps: Deps,
  params: { vendorOrgId: string; buyerOrgId: string; productId: string },
): Promise<ProductDetail | null> {
  const [product, tiers] = await Promise.all([
    deps.catalogue.getProduct(params.productId),
    deps.catalogue.listPriceTiers(params.productId),
  ]);
  if (product.vendorOrgId !== params.vendorOrgId || !product.isActive) return null;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const [price, ...tierPrices] = await deps.pricing.resolvePrices({
    vendorOrgId: params.vendorOrgId,
    buyerOrgId: params.buyerOrgId,
    items: [
      { productId: product.id, quantity: defaultQuantity(product) },
      ...sorted.map((t) => ({ productId: product.id, quantity: t.minQty })),
    ],
  });
  return { product, tiers: sorted, tierPrices, price: price! };
}

export interface CartRow {
  line: CartLine;
  /** Missing when the product was deleted or deactivated since it was added. */
  product?: Product;
  price?: ResolvedPrice;
  /** Below the product's minimum order quantity. */
  belowMinimum: boolean;
}

/** Re-resolves every cart line at its current quantity (tiers depend on quantity). */
export async function loadCartPricing(
  deps: Deps,
  params: { vendorOrgId: string; buyerOrgId: string; lines: CartLine[] },
): Promise<{ rows: CartRow[]; total: number; itemCount: number }> {
  if (params.lines.length === 0) return { rows: [], total: 0, itemCount: 0 };
  const products = await deps.catalogue.listProducts({ vendorOrgId: params.vendorOrgId });
  const active = new Map(products.map((p) => [p.id, p]));
  const orderable = params.lines.filter((l) => active.has(l.productId) && l.quantity > 0);
  const prices = orderable.length
    ? await deps.pricing.resolvePrices({
        vendorOrgId: params.vendorOrgId,
        buyerOrgId: params.buyerOrgId,
        items: orderable.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      })
    : [];
  const priceOf = new Map(prices.map((p) => [p.productId, p]));
  const rows = params.lines.map((line) => {
    const product = active.get(line.productId);
    return {
      line,
      product,
      price: product ? priceOf.get(line.productId) : undefined,
      belowMinimum: !!product && line.quantity < defaultQuantity(product),
    };
  });
  return {
    rows,
    total: roundMoney(rows.reduce((sum, r) => sum + (r.price?.lineTotal ?? 0), 0)),
    itemCount: rows.filter((r) => r.product).reduce((n, r) => n + r.line.quantity, 0),
  };
}

/**
 * Why the buyer pays what they pay (03 → "Product detail": show "your price" if it differs) —
 * one rule for both apps. Negotiated = brand violet, promotion = success green, tier = info.
 */
export function priceNote(price: ResolvedPrice): { msg: Msg; variant: 'brand' | 'success' | 'info' } | undefined {
  if (price.appliedPromotion) {
    const p = price.appliedPromotion;
    return { msg: msg('catalogue.price.off', { value: p.type === 'percentage' ? formatPercent(p.value) : formatMoney(p.value) }), variant: 'success' };
  }
  if (price.source === 'override') return { msg: msg('catalogue.price.yourPrice'), variant: 'brand' };
  if (price.source === 'tier') return { msg: msg('catalogue.price.volume'), variant: 'info' };
  return undefined;
}
