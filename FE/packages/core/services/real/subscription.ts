import type { SubscriptionService } from '../orgs';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline-v1.1.md.
// Replace each stub with a real call when its endpoint exists.
export const subscriptionService: SubscriptionService = {
  listTiers: async () => notImplemented('subscription.listTiers'),
  getUsage: async () => notImplemented('subscription.getUsage'),
  requestUpgrade: async () => notImplemented('subscription.requestUpgrade'),
  listUpgradeRequests: async () => notImplemented('subscription.listUpgradeRequests'),
};
