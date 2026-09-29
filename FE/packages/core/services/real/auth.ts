import type { AuthService } from '../auth';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const authService: AuthService = {
  login: async () => notImplemented('auth.login'),
  restoreSession: async () => notImplemented('auth.restoreSession'),
  logout: async () => notImplemented('auth.logout'),
  registerVendor: async () => notImplemented('auth.registerVendor'),
  acceptInvite: async () => notImplemented('auth.acceptInvite'),
  updateProfile: async () => notImplemented('auth.updateProfile'),
  changePassword: async () => notImplemented('auth.changePassword'),
};
