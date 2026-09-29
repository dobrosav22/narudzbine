import type { InvitesService } from '../invites';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const invitesService: InvitesService = {
  createBuyerOrgInvite: async () => notImplemented('invites.createBuyerOrgInvite'),
  createTeamInvite: async () => notImplemented('invites.createTeamInvite'),
  listSent: async () => notImplemented('invites.listSent'),
  getByToken: async () => notImplemented('invites.getByToken'),
  revoke: async () => notImplemented('invites.revoke'),
};
