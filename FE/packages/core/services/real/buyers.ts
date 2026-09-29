import type { BuyersService } from '../orgs';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const buyersService: BuyersService = {
  listConnections: async () => notImplemented('buyers.listConnections'),
  getConnection: async () => notImplemented('buyers.getConnection'),
  removeConnection: async () => notImplemented('buyers.removeConnection'),
};
