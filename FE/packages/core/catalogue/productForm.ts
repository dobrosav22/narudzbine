/**
 * Product edit form logic shared by apps/web and apps/mobile: drafts are what
 * inputs hold (strings), validation turns them into service inputs. Keeping it
 * here means both apps accept the same input and show the same messages.
 */
import { FORMAT_LOCALE, formatNumber } from '../helpers';
import { roundMoney } from '../pricing';
import type { PriceTierInput, Product, PriceTier } from '../types';
import { msg, type Msg } from '../i18n/message';


export interface ProductDraft {
  name: string;
  sku: string;
  description: string;
  categoryId: string; // '' = none
  tagIds: string[];
  basePrice: string;
  unit: string;
  stock: string;
  minOrderQuantity: string;
  isActive: boolean;
  /** '' = no image. Set from an upload result, never typed. */
  imageUrl: string;
}

export interface TierDraft {
  minQty: string;
  pricePerUnit: string;
}

export type ProductFormValues = Omit<Product, 'id' | 'vendorOrgId'>;
export type DraftErrors = Partial<Record<keyof ProductDraft, Msg>>;

/**
 * Parses what a person types in a bs-BA (or en) UI: "19,60", "19.60",
 * "1.234,50", "1 234,50". A comma, when present, is the decimal separator and
 * dots are grouping; without a comma a single dot is the decimal point.
 * Returns undefined for empty or unparseable input.
 */
export function parseDecimal(input: string): number | undefined {
  let s = input.trim().replace(/[\s  ]/g, '');
  if (!s) return undefined;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  return Number(s);
}

/** Number → input text in the display locale ("19,60"), without grouping so it round-trips through parseDecimal. */
export function toDecimalInput(value: number | undefined, fractionDigits = 2, locale: string = FORMAT_LOCALE): string {
  if (value === undefined) return '';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  }).format(value);
}

export function emptyProductDraft(): ProductDraft {
  return {
    name: '',
    sku: '',
    description: '',
    categoryId: '',
    tagIds: [],
    basePrice: '',
    unit: '',
    stock: '',
    minOrderQuantity: '',
    isActive: true,
    imageUrl: '',
  };
}

export function productToDraft(p: Product): ProductDraft {
  return {
    name: p.name,
    sku: p.sku,
    description: p.description ?? '',
    categoryId: p.categoryId ?? '',
    tagIds: [...p.tagIds],
    basePrice: toDecimalInput(p.basePrice),
    unit: p.unit,
    stock: p.stock === undefined ? '' : String(p.stock),
    minOrderQuantity: p.minOrderQuantity === undefined ? '' : String(p.minOrderQuantity),
    isActive: p.isActive,
    imageUrl: p.imageUrl ?? '',
  };
}

function wholeNumber(input: string, min: number): number | undefined | 'invalid' {
  if (!input.trim()) return undefined;
  const n = parseDecimal(input);
  return n === undefined || !Number.isInteger(n) || n < min ? 'invalid' : n;
}

export function validateProductDraft(
  d: ProductDraft,
  opts: { tracksInventory: boolean },
): { ok: true; value: ProductFormValues } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  if (!d.name.trim()) errors.name = msg('errors.productNameRequired');
  if (!d.sku.trim()) errors.sku = msg('errors.skuRequired');
  if (!d.unit.trim()) errors.unit = msg('validation.product.unitRequired');

  const basePrice = parseDecimal(d.basePrice);
  if (basePrice === undefined) errors.basePrice = msg('validation.product.priceInvalid');
  else if (basePrice < 0) errors.basePrice = msg('errors.priceNegative');

  const moq = wholeNumber(d.minOrderQuantity, 1);
  if (moq === 'invalid') errors.minOrderQuantity = msg('validation.product.minOrderInvalid');

  // Stock only exists when the vendor tracks inventory (01 §3); blank = 0 then.
  const stock = opts.tracksInventory ? wholeNumber(d.stock, 0) : undefined;
  if (stock === 'invalid') errors.stock = msg('validation.product.stockInvalid');

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: d.name.trim(),
      sku: d.sku.trim(),
      description: d.description.trim() || undefined,
      categoryId: d.categoryId || undefined,
      tagIds: d.tagIds,
      basePrice: roundMoney(basePrice!),
      unit: d.unit.trim(),
      ...(opts.tracksInventory ? { stock: (stock as number | undefined) ?? 0 } : {}),
      minOrderQuantity: moq as number | undefined,
      isActive: d.isActive,
      // [assumed] undefined clears it (the mock keeps the key); a real PATCH must send null for that.
      imageUrl: d.imageUrl || undefined,
    },
  };
}

export function tiersToDrafts(tiers: PriceTier[]): TierDraft[] {
  return [...tiers]
    .sort((a, b) => a.minQty - b.minQty)
    .map((t) => ({ minQty: String(t.minQty), pricePerUnit: toDecimalInput(t.pricePerUnit) }));
}

/**
 * Quantity tiers (01 §3): each starts at a whole quantity ≥ 2 (quantity 1 is
 * the base price), no two start at the same quantity, and — as a UI rule
 * [assumed] — bigger quantities never cost more per unit than smaller ones or
 * than the base price. Blank rows are ignored.
 */
export function validateTierDrafts(
  drafts: TierDraft[],
  basePrice: number | undefined,
): { ok: true; value: PriceTierInput[] } | { ok: false; errors: (Msg | undefined)[] } {
  const errors: (Msg | undefined)[] = drafts.map(() => undefined);
  const parsed: { i: number; minQty: number; price: number }[] = [];

  drafts.forEach((d, i) => {
    if (!d.minQty.trim() && !d.pricePerUnit.trim()) return;
    const minQty = parseDecimal(d.minQty);
    const price = parseDecimal(d.pricePerUnit);
    if (minQty === undefined || !Number.isInteger(minQty) || minQty < 2) errors[i] = msg('validation.tier.qtyInvalid');
    else if (price === undefined || price < 0) errors[i] = msg('validation.tier.priceInvalid');
    else parsed.push({ i, minQty, price });
  });

  parsed.sort((a, b) => a.minQty - b.minQty);
  parsed.forEach((t, k) => {
    const prev = parsed[k - 1];
    if (prev && prev.minQty === t.minQty) errors[t.i] = msg('validation.tier.duplicate', { qty: formatNumber(t.minQty) });
    else if (prev && t.price > prev.price) errors[t.i] = msg('validation.tier.moreThanPrevious', { qty: formatNumber(prev.minQty) });
    else if (!prev && basePrice !== undefined && t.price > basePrice) errors[t.i] = msg('validation.tier.moreThanBase');
  });

  if (errors.some(Boolean)) return { ok: false, errors };
  return { ok: true, value: parsed.map((t) => ({ minQty: t.minQty, pricePerUnit: roundMoney(t.price) })) };
}
