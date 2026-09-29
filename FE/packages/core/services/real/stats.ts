import type { StatsService } from '../stats';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const statsService: StatsService = {
  getVendorSummary: async () => notImplemented('stats.getVendorSummary'),
  byProduct: async () => notImplemented('stats.byProduct'),
  byBuyer: async () => notImplemented('stats.byBuyer'),
  getBuyerSummary: async () => notImplemented('stats.getBuyerSummary'),
  getMostOrdered: async () => notImplemented('stats.getMostOrdered'),
};
