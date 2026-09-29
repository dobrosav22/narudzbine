import type { CreateBuyerOrgInviteInput, CreateTeamInviteInput, Invite } from '../types';

export interface InvitePreview {
  invite: Invite;
  /** Name of the vendor (buyer_org_invite) or target org (team_member_invite). */
  orgName: string;
  /** True if the invited email already has an account — the UI then asks for a password only. */
  emailHasAccount: boolean;
}

export interface InvitesService {
  /** POST /vendor-orgs/:id/invites — throws PLAN_LIMIT when the tier's maxBuyers is reached. */
  createBuyerOrgInvite(input: CreateBuyerOrgInviteInput): Promise<Invite>;
  /** POST /vendor-orgs/:id/users/invites or /buyer-orgs/:id/users/invites */
  createTeamInvite(input: CreateTeamInviteInput): Promise<Invite>;
  /** Pending invites an org has sent, for the Buyers/Team screens. */
  listSent(params: { vendorOrgId?: string; targetOrgId?: string }): Promise<Invite[]>;
  /**
   * [assumed] Withdraw a pending invite (a typo'd email, someone who left). The contract has no
   * 'revoked' status, so the invite becomes 'expired' and its link stops working.
   */
  revoke(inviteId: string): Promise<void>;
  /** GET /invites/:token — to render the acceptance screen before submission. */
  getByToken(token: string): Promise<InvitePreview>;
  // Acceptance lives on AuthService.acceptInvite since it produces a session.
}
