import type { TeamService } from '../orgs';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const teamService: TeamService = {
  listVendorUsers: async () => notImplemented('team.listVendorUsers'),
  removeVendorUser: async () => notImplemented('team.removeVendorUser'),
  listBuyerUsers: async () => notImplemented('team.listBuyerUsers'),
  removeBuyerUser: async () => notImplemented('team.removeBuyerUser'),
  setHomeLocation: async () => notImplemented('team.setHomeLocation'),
};
