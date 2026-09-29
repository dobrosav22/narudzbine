"use client";

import { useSyncExternalStore } from "react";
import {
  createSessionStore,
  services,
  type KeyValueStorage,
  type Membership,
  type SessionState,
  type SignedInState,
  type AdminState,
} from "@repo/core";

/** localStorage can throw (private mode, blocked storage) — never let that break sign-in. */
export const webStorage: KeyValueStorage = {
  async getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Session just won't survive a reload.
    }
  },
  async removeItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to clean up.
    }
  },
};

/** One store per browser tab; the logic lives in @repo/core (shared with mobile). */
export const sessionStore = createSessionStore({
  storage: webStorage,
  auth: services.auth,
  buyerOrgs: services.buyerOrgs,
});

const LOADING: SessionState = { status: "loading" };

export function useSession(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState, () => LOADING);
}

/** For components rendered inside a signed-in guard (see RequireRole). */
export function useSignedIn(): SignedInState {
  const state = useSession();
  if (state.status !== "signedIn") throw new Error("useSignedIn used outside a signed-in route");
  return state;
}

export function homePath(membership: Membership): string {
  return membership.orgType === "vendor" ? "/vendor" : "/buyer";
}

/** For components inside the admin shell (see RequireAdmin). */
export function useAdminSession(): AdminState {
  const state = useSession();
  if (state.status !== "admin") throw new Error("useAdminSession used outside the admin shell");
  return state;
}

export const ADMIN_HOME = "/admin";

/** Where a settled session lands: the admin shell, the membership's shell, or login (02 v1.1: admin first). */
export function homeFor(state: SessionState): string {
  if (state.status === "admin") return ADMIN_HOME;
  if (state.status === "signedIn") return homePath(state.membership);
  return "/login";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
