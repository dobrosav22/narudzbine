import type { MerchandisingService } from '../services';
import type { Promotion } from '../types';
import { serviceError } from '../errors';
import { db } from './db';
import { clone, delay, findOrThrow, newId } from './util';

function validatePromotion(p: Promotion): void {
  if (!(p.value > 0)) throw serviceError('VALIDATION', 'errors.discountNotPositive');
  if (p.type === 'percentage' && p.value > 100) throw serviceError('VALIDATION', 'errors.discountOver100');
  if (p.scope !== 'all' && p.scopeIds.length === 0) throw serviceError('VALIDATION', 'errors.scopeEmpty', { scope: p.scope });
  if (new Date(p.endDate) < new Date(p.startDate)) throw serviceError('VALIDATION', 'errors.endBeforeStart');
}

export const merchandisingService: MerchandisingService = {
  async listFeatured(vendorOrgId) {
    await delay();
    return clone(db.featured.filter((f) => f.vendorOrgId === vendorOrgId).sort((a, b) => a.position - b.position));
  },
  async setFeatured(vendorOrgId, productIds) {
    await delay();
    for (const id of productIds) findOrThrow(db.products, (p) => p.id === id && p.vendorOrgId === vendorOrgId, 'Product');
    const next = [...new Set(productIds)].map((productId, position) => ({ id: newId('fp'), vendorOrgId, productId, position }));
    db.featured = [...db.featured.filter((f) => f.vendorOrgId !== vendorOrgId), ...next];
    return clone(next);
  },

  async listPromotions(vendorOrgId) {
    await delay();
    return clone(db.promotions.filter((p) => p.vendorOrgId === vendorOrgId).sort((a, b) => b.startDate.localeCompare(a.startDate)));
  },
  async createPromotion(input) {
    await delay();
    const promo: Promotion = { ...clone(input), id: newId('promo') };
    validatePromotion(promo);
    db.promotions.push(promo);
    return clone(promo);
  },
  async updatePromotion(promotionId, patch) {
    await delay();
    const promo = findOrThrow(db.promotions, (p) => p.id === promotionId, 'Promotion');
    const next = { ...promo, ...clone(patch) };
    validatePromotion(next);
    Object.assign(promo, next);
    return clone(promo);
  },
  async deletePromotion(promotionId) {
    await delay();
    db.promotions = db.promotions.filter((p) => p.id !== promotionId);
  },
};
