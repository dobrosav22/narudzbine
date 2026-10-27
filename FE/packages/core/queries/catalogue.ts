import { api, data, send } from '../api/client';
import { isApiError } from '../api/problem';
import type {
  AgreedPrice,
  AgreedPriceInput,
  Asset,
  BulkChange,
  BulkResult,
  FeaturedUpdate,
  ImportPreview,
  ImportResult,
  NamedResource,
  Partner,
  Pricing,
  PricingUpdate,
  Product,
  ProductInput,
  ProductUpdate,
  Relationship,
  Tier,
  Unit,
  VendorPlan,
} from '../api/models';
import type { QueryOf } from '../api/models';
import { msg, type Msg } from '../i18n/message';
import { problemMsg } from '../i18n/problem';
import { applyPercent, compareMoney, moneyToCents } from '../money';
import { fetchAllRelationships, fetchPartnerOrNull } from './partners';
import { en } from '../i18n/resources.gen';

/*
 * Vendor catalogue: taxonomy (categories/tags/units), products, base pricing and volume tiers,
 * agreed buyer prices, featured flag, atomic bulk edits, CSV import and product galleries.
 * React-free: both apps wrap these factories with TanStack Query. Promotions live in
 * promotions.ts and stock/tracking in inventory.ts.
 */

// ── Keys ────────────────────────────────────────────────────────────────

export type TaxonomyKind = 'categories' | 'tags' | 'units';
export type ProductListQuery = QueryOf<'listProducts'>;
export type ProductState = Product['state'];
export type ProductCommand = 'activate' | 'deactivate' | 'archive' | 'restore';

/** Everything under ['catalogue'] is vendor-own catalogue data; invalidate by prefix after writes. */
export const catalogueKeys = {
  all: ['catalogue'] as const,
  taxonomy: (kind: TaxonomyKind) => ['catalogue', 'taxonomy', kind] as const,
  products: () => ['catalogue', 'products'] as const,
  productList: (q: ProductListQuery) => ['catalogue', 'products', 'list', q] as const,
  allProducts: () => ['catalogue', 'products', 'all'] as const,
  product: (id: string) => ['catalogue', 'products', 'one', id] as const,
  pricing: (productId: string) => ['catalogue', 'pricing', productId] as const,
  planUsage: () => ['catalogue', 'planUsage'] as const,
  buyers: () => ['catalogue', 'buyers'] as const,
  agreedPrices: (relationshipId: string) => ['catalogue', 'agreedPrices', relationshipId] as const,
  importPreview: (id: string) => ['catalogue', 'import', id] as const,
  asset: (id: string) => ['catalogue', 'asset', id] as const,
};

/** Offset-paged lists: fetches every page (size 100). Taxonomy and relationship sets are small. */
export async function fetchAllCataloguePages<T>(load: (page: number) => Promise<{ items: T[]; size: number }>, maxPages = 100): Promise<T[]> {
  const items: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const result = await load(page);
    items.push(...result.items);
    if (result.items.length < result.size) break;
  }
  return items;
}

// ── Taxonomy ────────────────────────────────────────────────────────────

export type TaxonomyItem = NamedResource | Unit;

function listTaxonomyPage(kind: TaxonomyKind, page: number) {
  const query = { page, size: 100, sort: 'NAME_ASC' as const };
  switch (kind) {
    case 'categories':
      return data(api.GET('/catalogue/categories', { params: { query } }));
    case 'tags':
      return data(api.GET('/catalogue/tags', { params: { query } }));
    case 'units':
      return data(api.GET('/catalogue/units', { params: { query } }));
  }
}

export function createTaxonomyItem(kind: TaxonomyKind, body: { id: string; name: string }): Promise<TaxonomyItem> {
  switch (kind) {
    case 'categories':
      return data(api.POST('/catalogue/categories', { body }));
    case 'tags':
      return data(api.POST('/catalogue/tags', { body }));
    case 'units':
      return data(api.POST('/catalogue/units', { body }));
  }
}

export function renameTaxonomyItem(kind: TaxonomyKind, id: string, body: { expectedRevision: string; name: string }): Promise<TaxonomyItem> {
  const params = { path: { resourceId: id } };
  switch (kind) {
    case 'categories':
      return data(api.PUT('/catalogue/categories/{resourceId}', { params, body }));
    case 'tags':
      return data(api.PUT('/catalogue/tags/{resourceId}', { params, body }));
    case 'units':
      return data(api.PUT('/catalogue/units/{resourceId}', { params, body }));
  }
}

export async function deleteTaxonomyItem(kind: TaxonomyKind, id: string, expectedRevision: string): Promise<void> {
  const params = { path: { resourceId: id }, query: { expectedRevision } };
  switch (kind) {
    case 'categories':
      await api.DELETE('/catalogue/categories/{resourceId}', { params });
      return;
    case 'tags':
      await api.DELETE('/catalogue/tags/{resourceId}', { params });
      return;
    case 'units':
      await api.DELETE('/catalogue/units/{resourceId}', { params });
      return;
  }
}

/** Name limits per contract: units 50, categories/tags 100 code points (after trim). */
export const TAXONOMY_NAME_MAX: Record<TaxonomyKind, number> = { categories: 100, tags: 100, units: 50 };

// ── Products ────────────────────────────────────────────────────────────

export function createProduct(body: ProductInput): Promise<Product> {
  return data(api.POST('/catalogue/products', { body }));
}

export function updateProduct(id: string, body: ProductUpdate): Promise<Product> {
  return data(api.PUT('/catalogue/products/{productId}', { params: { path: { productId: id } }, body }));
}

export function runProductCommand(id: string, command: ProductCommand, expectedRevision: string): Promise<Product> {
  const init = { params: { path: { productId: id } }, body: { expectedRevision } };
  switch (command) {
    case 'activate':
      return data(api.POST('/catalogue/products/{productId}/activate', init));
    case 'deactivate':
      return data(api.POST('/catalogue/products/{productId}/deactivate', init));
    case 'archive':
      return data(api.POST('/catalogue/products/{productId}/archive', init));
    case 'restore':
      return data(api.POST('/catalogue/products/{productId}/restore', init));
  }
}

export function setProductFeatured(id: string, body: FeaturedUpdate): Promise<Product> {
  return data(api.PUT('/catalogue/products/{productId}/featured', { params: { path: { productId: id } }, body }));
}

export function bulkEditProducts(body: BulkChange): Promise<BulkResult> {
  return data(api.POST('/catalogue/bulk-edits', { body }));
}

/** Which state commands the product's current state allows (the backend re-checks). */
export function productCommands(state: ProductState): ProductCommand[] {
  if (state === 'ARCHIVED') return ['restore'];
  return state === 'ACTIVE' ? ['deactivate', 'archive'] : ['activate', 'archive'];
}

/** Bulk edits accept 1..100 targets. */
export const BULK_MAX_TARGETS = 100;
/** A product gallery holds at most five images; the first is the primary one. */
export const GALLERY_MAX = 5;

// ── Pricing and agreed buyer prices ─────────────────────────────────────

export function updatePricing(productId: string, body: PricingUpdate): Promise<Pricing> {
  return data(api.PUT('/catalogue/products/{productId}/pricing', { params: { path: { productId } }, body }));
}

export function setAgreedPrice(relationshipId: string, productId: string, body: AgreedPriceInput): Promise<AgreedPrice> {
  return data(api.PUT('/relationships/{relationshipId}/agreed-prices/{productId}', { params: { path: { relationshipId, productId } }, body }));
}

export async function removeAgreedPrice(relationshipId: string, productId: string, expectedRevision: string): Promise<void> {
  await api.DELETE('/relationships/{relationshipId}/agreed-prices/{productId}', {
    params: { path: { relationshipId, productId }, query: { expectedRevision } },
  });
}

/** A connected buyer as the vendor sees it: the relationship plus the partner's approved display name. */
export interface CatalogueBuyer {
  relationship: Relationship;
  /** Null when the partner record is not readable (legacy history); show a neutral label. */
  partner: Partner | null;
}

async function loadCatalogueBuyers(): Promise<CatalogueBuyer[]> {
  const relationships = await fetchAllRelationships('ACTIVE');
  return Promise.all(relationships.map(async (relationship) => ({ relationship, partner: await fetchPartnerOrNull(relationship.buyerId) })));
}

// ── Plan usage (read-only; the plan screen belongs to the plan area) ───

/** True when one more non-archived product would exceed the plan's product limit. */
export function productLimitReached(plan: VendorPlan | undefined): boolean {
  return !!plan && plan.nonArchivedProductCount >= plan.plan.productLimit;
}

// ── CSV import ──────────────────────────────────────────────────────────

/** Exact accepted header columns (sku and name are required). */
export const CSV_IMPORT_COLUMNS = [
  'sku',
  'name',
  'description',
  'unitId',
  'packDescription',
  'categoryId',
  'tagIds',
  'basePrice',
  'minimumQuantity',
  'quantityStep',
  'activate',
] as const;
export const CSV_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** POST raw CSV text; returns the preview (201). Max 3 previews per vendor per hour. */
export async function previewCsvImport(csv: string | Blob): Promise<ImportPreview> {
  const response = await send('/catalogue/import-previews', {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv; charset=UTF-8' },
    body: csv,
  });
  return (await response.json()) as ImportPreview;
}

export function confirmCsvImport(previewId: string, expectedRevision: string): Promise<ImportResult> {
  return data(api.POST('/catalogue/import-previews/{previewId}/confirmation', { params: { path: { previewId } }, body: { expectedRevision } }));
}

/** IMPORT_STALE carries `importErrors` (row/column/code) on the problem body. */
export function importStaleErrors(error: unknown): { row: number; column: string; code: string }[] {
  if (!isApiError(error, 'IMPORT_STALE')) return [];
  const rows = (error.problem as { importErrors?: unknown }).importErrors;
  return Array.isArray(rows) ? (rows as { row: number; column: string; code: string }[]) : [];
}

// ── Media / gallery ─────────────────────────────────────────────────────

export const IMAGE_MAX_BYTES = 5_242_880;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export function isImageType(type: string | null | undefined): type is ImageType {
  return (IMAGE_TYPES as readonly string[]).includes(type ?? '');
}

/**
 * Streams raw image bytes to a client-chosen UUIDv7 asset id (202 Asset). Retry an uncertain
 * outcome only with the SAME id and the same bytes; never allocate a new id blindly.
 */
export async function uploadImageBytes(assetId: string, body: Blob | ArrayBuffer, contentType: ImageType): Promise<Asset> {
  const response = await send(`/media/assets/${assetId}/upload`, { method: 'PUT', headers: { 'Content-Type': contentType }, body });
  return (await response.json()) as Asset;
}

export function getAsset(assetId: string): Promise<Asset> {
  return data(api.GET('/media/assets/{assetId}', { params: { path: { assetId } } }));
}

export function setProductGallery(productId: string, expectedRevision: string, assetIds: string[]): Promise<Product> {
  return data(api.PUT('/catalogue/products/{productId}/gallery', { params: { path: { productId } }, body: { expectedRevision, assetIds } }));
}

/** Poll delay for an asset still being processed; null once the state is final. */
export function assetPollDelay(asset: Asset | undefined, attempt: number): number | null {
  if (asset && asset.state !== 'QUEUED' && asset.state !== 'PROCESSING') return null;
  return Math.min(10_000, 1_500 + attempt * 500);
}

/**
 * Polls an asset until READY/FAILED/DELETED, the timeout passes (returns the last, still
 * pending, asset) or the signal aborts (rejects). Never attaches anything itself.
 */
export async function waitForAsset(assetId: string, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<Asset> {
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000);
  for (let attempt = 0; ; attempt++) {
    if (opts.signal?.aborted) throw new Error('aborted');
    const asset = await getAsset(assetId);
    const delay = assetPollDelay(asset, attempt);
    if (delay === null || Date.now() + delay > deadline) return asset;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

// ── Query factories ─────────────────────────────────────────────────────

export const catalogueQueries = {
  taxonomy: <K extends TaxonomyKind>(kind: K) => ({
    queryKey: catalogueKeys.taxonomy(kind),
    queryFn: () => fetchAllCataloguePages((page) => listTaxonomyPage(kind, page)) as Promise<K extends 'units' ? Unit[] : NamedResource[]>,
  }),
  products: (q: ProductListQuery) => ({
    queryKey: catalogueKeys.productList(q),
    queryFn: () => data(api.GET('/catalogue/products', { params: { query: q } })),
  }),
  /** Every product (all states). The vendor list has no featured filter, so the featured screen needs this. */
  allProducts: () => ({
    queryKey: catalogueKeys.allProducts(),
    queryFn: () => fetchAllCataloguePages((page) => data(api.GET('/catalogue/products', { params: { query: { page, size: 100 } } }))),
  }),
  product: (id: string) => ({
    queryKey: catalogueKeys.product(id),
    queryFn: () => data(api.GET('/catalogue/products/{productId}', { params: { path: { productId: id } } })),
  }),
  pricing: (productId: string) => ({
    queryKey: catalogueKeys.pricing(productId),
    queryFn: () => data(api.GET('/catalogue/products/{productId}/pricing', { params: { path: { productId } } })),
  }),
  planUsage: () => ({
    queryKey: catalogueKeys.planUsage(),
    queryFn: () => data(api.GET('/organization/plan')),
  }),
  buyers: () => ({ queryKey: catalogueKeys.buyers(), queryFn: loadCatalogueBuyers }),
  /** All agreed prices of one relationship plus the review tokens of the last page read. */
  agreedPrices: (relationshipId: string) => ({
    queryKey: catalogueKeys.agreedPrices(relationshipId),
    queryFn: () =>
      fetchAllCataloguePages((page) =>
        data(api.GET('/relationships/{relationshipId}/agreed-prices', { params: { path: { relationshipId }, query: { page, size: 100 } } })),
      ),
  }),
  importPreview: (id: string) => ({
    queryKey: catalogueKeys.importPreview(id),
    queryFn: () => data(api.GET('/catalogue/import-previews/{previewId}', { params: { path: { previewId: id } } })),
  }),
  asset: (id: string) => ({ queryKey: catalogueKeys.asset(id), queryFn: () => getAsset(id) }),
};

// ── Input parsing (strings in, contract values out) ─────────────────────

export const PRICE_MAX_CENTS = 99_999_999_999;
export const QUANTITY_MAX = 1_000_000_000;

/**
 * Parses a typed price ("1.234,50", "12,5", "12.50") into the contract's exact decimal string
 * ("1234.50"). A comma, when present, is the decimal separator and dots group thousands;
 * without a comma a single dot is the decimal point. More than two decimals is invalid (never
 * rounded). Returns undefined for blank input and null when invalid or out of range.
 */
export function parsePriceInput(input: string, opts: { allowZero?: boolean } = {}): string | null | undefined {
  let s = input.trim().replace(/[\s  ]/g, '');
  if (!s) return undefined;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!match) return null;
  const whole = match[1]!.replace(/^0+(?=\d)/, '');
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const cents = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(cents) || cents > PRICE_MAX_CENTS) return null;
  if (cents === 0 && !opts.allowZero) return null;
  return `${whole}.${fraction}`;
}

/** Contract money ("1234.50") as input text for the region ("1234,50"); RS and BA both use a decimal comma. */
export function priceToInput(money: string | null | undefined): string {
  return money ? money.replace('.', ',') : '';
}

/** Whole quantity in [min, QUANTITY_MAX]; undefined for blank, null when invalid. */
export function parseQuantityInput(input: string, min = 1, max = QUANTITY_MAX): number | null | undefined {
  const s = input.trim().replace(/[\s.  ]/g, '');
  if (!s) return undefined;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

/** Signed whole stock delta, -1e9..1e9 and not zero. */
export function parseDeltaInput(input: string): number | null | undefined {
  const s = input.trim().replace(/[\s  ]/g, '').replace(/^\+/, '');
  if (!s) return undefined;
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n !== 0 && Math.abs(n) <= QUANTITY_MAX ? n : null;
}

/**
 * Bulk PERCENT_CHANGE result for one base price: half-up to two decimals, as the backend
 * computes it. Returns null when the result would be zero/negative or above the maximum.
 * `percent` is the contract string ("-10.00").
 */
export function bulkPercentResult(basePrice: string, percent: string): string | null {
  const result = applyPercent(basePrice, percent);
  const cents = moneyToCents(result);
  return cents <= 0n || cents > BigInt(PRICE_MAX_CENTS) ? null : result;
}

/** Parses a bulk percent change ("-10", "5,5"): > -100 and <= 1000, two decimals at most. */
export function parsePercentChangeInput(input: string): string | null | undefined {
  const s = input.trim().replace(/[\s  %]/g, '');
  if (!s) return undefined;
  const negative = s.startsWith('-');
  const magnitude = parsePriceInput(s.replace(/^[-+]/, ''), { allowZero: true });
  if (!magnitude) return null;
  const cents = moneyToCents(magnitude);
  if (cents === 0n || (negative && cents >= 10_000n) || (!negative && cents > 100_000n)) return null;
  return `${negative ? '-' : ''}${magnitude}`;
}

// ── Product form ────────────────────────────────────────────────────────

export interface ProductDraft {
  sku: string;
  name: string;
  description: string;
  unitId: string;
  packDescription: string;
  categoryId: string;
  tagIds: string[];
  minimumQuantity: string;
  quantityStep: string;
}

export type ProductFields = Omit<ProductInput, 'id'> & {
  description: string | null;
  unitId: string | null;
  packDescription: string | null;
  categoryId: string | null;
};

export type ProductDraftErrors = Partial<Record<keyof ProductDraft, Msg>>;

export const SKU_PATTERN = /^[A-Za-z0-9._/-]{1,64}$/;
export const PRODUCT_LIMITS = { name: 200, description: 5000, pack: 200, tags: 50 } as const;

const codePoints = (s: string) => Array.from(s).length;

export function emptyProductDraft(): ProductDraft {
  return { sku: '', name: '', description: '', unitId: '', packDescription: '', categoryId: '', tagIds: [], minimumQuantity: '1', quantityStep: '1' };
}

export function productToDraft(p: Product): ProductDraft {
  return {
    sku: p.sku,
    name: p.name,
    description: p.description ?? '',
    unitId: p.unitId ?? '',
    packDescription: p.packDescription ?? '',
    categoryId: p.categoryId ?? '',
    tagIds: [...p.tagIds],
    minimumQuantity: String(p.minimumQuantity),
    quantityStep: String(p.quantityStep),
  };
}

export function validateProductDraft(d: ProductDraft): { ok: true; value: ProductFields } | { ok: false; errors: ProductDraftErrors } {
  const errors: ProductDraftErrors = {};
  const sku = d.sku.trim();
  const name = d.name.trim();
  const description = d.description.replace(/\r\n/g, '\n').trim();
  const pack = d.packDescription.trim();
  if (!sku) errors.sku = msg('productEditor.errors.skuRequired');
  else if (!SKU_PATTERN.test(sku)) errors.sku = msg('productEditor.errors.skuInvalid');
  if (!name) errors.name = msg('productEditor.errors.nameRequired');
  else if (codePoints(name) > PRODUCT_LIMITS.name) errors.name = msg('productEditor.errors.tooLong', { max: PRODUCT_LIMITS.name });
  if (codePoints(description) > PRODUCT_LIMITS.description) errors.description = msg('productEditor.errors.tooLong', { max: PRODUCT_LIMITS.description });
  if (/[\r\n]/.test(pack)) errors.packDescription = msg('productEditor.errors.singleLine');
  else if (codePoints(pack) > PRODUCT_LIMITS.pack) errors.packDescription = msg('productEditor.errors.tooLong', { max: PRODUCT_LIMITS.pack });
  if (d.tagIds.length > PRODUCT_LIMITS.tags) errors.tagIds = msg('productEditor.errors.tooManyTags', { max: PRODUCT_LIMITS.tags });
  const minimumQuantity = parseQuantityInput(d.minimumQuantity);
  const quantityStep = parseQuantityInput(d.quantityStep);
  if (minimumQuantity == null) errors.minimumQuantity = msg('productEditor.errors.wholeQuantity');
  if (quantityStep == null) errors.quantityStep = msg('productEditor.errors.wholeQuantity');
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      sku,
      name,
      description: description || null,
      unitId: d.unitId || null,
      packDescription: pack || null,
      categoryId: d.categoryId || null,
      tagIds: [...new Set(d.tagIds)],
      minimumQuantity: minimumQuantity!,
      quantityStep: quantityStep!,
    },
  };
}

/** True when the catalogue fields of two products are the same (state/featured/gallery ignored). */
export function sameCatalogueFields(a: Product, b: Product): boolean {
  return (
    a.sku === b.sku &&
    a.name === b.name &&
    a.description === b.description &&
    a.unitId === b.unitId &&
    a.packDescription === b.packDescription &&
    a.categoryId === b.categoryId &&
    a.minimumQuantity === b.minimumQuantity &&
    a.quantityStep === b.quantityStep &&
    [...a.tagIds].sort().join() === [...b.tagIds].sort().join()
  );
}

/** True when the validated fields would not change the product. */
export function productFieldsUnchanged(p: Product, f: ProductFields): boolean {
  return sameCatalogueFields(p, { ...p, ...f, tagIds: f.tagIds });
}

// ── Pricing form ────────────────────────────────────────────────────────

export interface TierDraft {
  minimumQuantity: string;
  unitPrice: string;
}

export interface PricingDraft {
  basePrice: string;
  tiers: TierDraft[];
}

export interface PricingErrors {
  basePrice?: Msg;
  tiers: (Msg | undefined)[];
  form?: Msg;
}

export const TIERS_MAX = 50;

export function pricingToDraft(p: Pricing | undefined): PricingDraft {
  return {
    basePrice: priceToInput(p?.basePrice),
    tiers: (p?.tiers ?? []).map((t) => ({ minimumQuantity: String(t.minimumQuantity), unitPrice: priceToInput(t.unitPrice) })),
  };
}

/**
 * Validates a base price + volume tiers against the product's quantity rules, as the backend
 * does: thresholds are whole, strictly above the minimum, reachable (minimum + n × step) and
 * distinct; prices strictly decrease from the base through each higher tier. Blank tier rows are
 * ignored. A blank base is allowed only without tiers (no price yet).
 */
export function validatePricingDraft(
  d: PricingDraft,
  rules: { minimumQuantity: number; quantityStep: number },
): { ok: true; value: { basePrice: string | null; tiers: Tier[] } } | { ok: false; errors: PricingErrors } {
  const errors: PricingErrors = { tiers: d.tiers.map(() => undefined) };
  const basePrice = parsePriceInput(d.basePrice);
  if (basePrice === null) errors.basePrice = msg('productEditor.errors.priceInvalid');

  const parsed: { i: number; qty: number; price: string }[] = [];
  d.tiers.forEach((t, i) => {
    if (!t.minimumQuantity.trim() && !t.unitPrice.trim()) return;
    const qty = parseQuantityInput(t.minimumQuantity, 2);
    const price = parsePriceInput(t.unitPrice);
    if (qty == null) errors.tiers[i] = msg('productEditor.errors.tierQuantity');
    else if (qty <= rules.minimumQuantity) errors.tiers[i] = msg('productEditor.errors.tierAboveMinimum', { min: rules.minimumQuantity });
    else if ((qty - rules.minimumQuantity) % rules.quantityStep !== 0)
      errors.tiers[i] = msg('productEditor.errors.tierStep', { min: rules.minimumQuantity, step: rules.quantityStep });
    else if (price == null) errors.tiers[i] = msg('productEditor.errors.priceInvalid');
    else parsed.push({ i, qty, price });
  });

  if (parsed.length > TIERS_MAX) errors.form = msg('productEditor.errors.tooManyTiers', { max: TIERS_MAX });
  if (parsed.length > 0 && basePrice === undefined) errors.basePrice = msg('productEditor.errors.baseForTiers');

  parsed.sort((a, b) => a.qty - b.qty);
  parsed.forEach((t, k) => {
    const prev = parsed[k - 1];
    if (prev && prev.qty === t.qty) errors.tiers[t.i] = msg('productEditor.errors.tierDuplicate');
    else if (prev && compareMoney(t.price, prev.price) >= 0) errors.tiers[t.i] = msg('productEditor.errors.tierNotLower');
    else if (!prev && basePrice && compareMoney(t.price, basePrice) >= 0) errors.tiers[t.i] = msg('productEditor.errors.tierNotBelowBase');
  });

  if (errors.basePrice || errors.form || errors.tiers.some(Boolean)) return { ok: false, errors };
  return { ok: true, value: { basePrice: basePrice ?? null, tiers: parsed.map((t) => ({ minimumQuantity: t.qty, unitPrice: t.price })) } };
}

/** True when the validated schedule equals the stored one (no write needed). */
export function pricingUnchanged(p: Pricing | undefined, v: { basePrice: string | null; tiers: Tier[] }): boolean {
  const stored = p ?? { basePrice: null, tiers: [] };
  if ((stored.basePrice ?? null) !== v.basePrice) return false;
  if (stored.tiers.length !== v.tiers.length) return false;
  return stored.tiers.every((t, i) => t.minimumQuantity === v.tiers[i]!.minimumQuantity && compareMoney(t.unitPrice, v.tiers[i]!.unitPrice) === 0);
}

// ── Problem messages ─────────────────────────────────────────────────

/** Catalogue/inventory/media failures use the shared `problems.codes` texts like every other area. */
export const catalogueProblemMsg = problemMsg;

/** The message for an asset failureCode (FAILED/DELETED assets). */
export function assetFailureMsg(code: string | null): Msg {
  return code && code in en.problems.codes ? msg(`problems.codes.${code}`) : msg('problems.codes.IMAGE_FAILED');
}
