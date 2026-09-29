import type { BuyerOrgsService } from '../orgs';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const buyerOrgsService: BuyerOrgsService = {
  getBuyerOrg: async () => notImplemented('buyerOrgs.getBuyerOrg'),
  updateBuyerOrg: async () => notImplemented('buyerOrgs.updateBuyerOrg'),
  listConnectedVendors: async () => notImplemented('buyerOrgs.listConnectedVendors'),
};
