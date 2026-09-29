import type { OrderStatusConfigService } from '../orders';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const orderStatusConfigService: OrderStatusConfigService = {
  get: async () => notImplemented('orderStatusConfig.get'),
  update: async () => notImplemented('orderStatusConfig.update'),
};
