import type { AdminService } from '../admin';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline-v1.1.md → "Platform Admin".
export const adminService: AdminService = {
  getPlatformSummary: async () => notImplemented('admin.getPlatformSummary'),
  listVendorOrgs: async () => notImplemented('admin.listVendorOrgs'),
  getVendorOrgDetail: async () => notImplemented('admin.getVendorOrgDetail'),
  listBuyerOrgs: async () => notImplemented('admin.listBuyerOrgs'),
  getBuyerOrgDetail: async () => notImplemented('admin.getBuyerOrgDetail'),
  setTier: async () => notImplemented('admin.setTier'),
  listUpgradeRequests: async () => notImplemented('admin.listUpgradeRequests'),
  resolveUpgradeRequest: async () => notImplemented('admin.resolveUpgradeRequest'),
  linkVendorBuyer: async () => notImplemented('admin.linkVendorBuyer'),
  unlinkVendorBuyer: async () => notImplemented('admin.unlinkVendorBuyer'),
};
