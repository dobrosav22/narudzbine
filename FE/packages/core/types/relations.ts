// Mirrors 04-data-contract-api-outline.md → "Vendor ↔ Buyer relationship & invites".

export interface VendorBuyerRelation {
  id: string;
  vendorOrgId: string;
  buyerOrgId: string;
  status: 'invited' | 'active' | 'removed';
  joinedAt?: string;
}

export interface Invite {
  id: string;
  type: 'buyer_org_invite' | 'team_member_invite';
  email: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  // for buyer_org_invite:
  vendorOrgId?: string;
  // for team_member_invite:
  targetOrgId?: string;
  targetOrgType?: 'vendor' | 'buyer';
  sentAt: string;
  acceptedAt?: string;
}
