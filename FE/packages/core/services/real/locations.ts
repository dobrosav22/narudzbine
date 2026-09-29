import type { LocationsService } from '../orgs';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const locationsService: LocationsService = {
  listVendorLocations: async () => notImplemented('locations.listVendorLocations'),
  createVendorLocation: async () => notImplemented('locations.createVendorLocation'),
  updateVendorLocation: async () => notImplemented('locations.updateVendorLocation'),
  deleteVendorLocation: async () => notImplemented('locations.deleteVendorLocation'),
  listBuyerLocations: async () => notImplemented('locations.listBuyerLocations'),
  createBuyerLocation: async () => notImplemented('locations.createBuyerLocation'),
  updateBuyerLocation: async () => notImplemented('locations.updateBuyerLocation'),
  deleteBuyerLocation: async () => notImplemented('locations.deleteBuyerLocation'),
};
