import type { VendorOrgsService } from '../orgs';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const vendorOrgsService: VendorOrgsService = {
  getVendorOrg: async () => notImplemented('vendorOrgs.getVendorOrg'),
  updateVendorOrg: async () => notImplemented('vendorOrgs.updateVendorOrg'),
};
