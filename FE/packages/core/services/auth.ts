import type { AcceptInviteInput, ChangePasswordInput, LoginInput, RegisterVendorInput, Session, UpdateProfileInput } from '../types';

/**
 * [assumed] Not in 04 — the contract has no auth section. The frontend needs
 * at least these operations; the backend owns the token format.
 */
export interface AuthService {
  login(input: LoginInput): Promise<Session>;
  /** Re-hydrate a session from a stored token; null if the token is no longer valid. */
  restoreSession(token: string): Promise<Session | null>;
  logout(token: string): Promise<void>;
  /** Vendor self-serve signup (03 → "Vendor onboarding"). */
  registerVendor(input: RegisterVendorInput): Promise<Session>;
  /** POST /invites/:token/accept — both invite variants; returns the resulting session. */
  acceptInvite(token: string, input: AcceptInviteInput): Promise<Session>;
  /**
   * [assumed] Account profile (01 §10 "Account profile"). The name belongs to the person, so it
   * changes on every membership of this login. Email is the login identity and isn't editable here.
   */
  updateProfile(input: UpdateProfileInput): Promise<Session>;
  /** [assumed] Throws UNAUTHORIZED for a wrong current password, VALIDATION for a weak new one. */
  changePassword(input: ChangePasswordInput): Promise<void>;
}
