"use client";

import { useSyncExternalStore } from "react";
import {
  API_BASE_URL,
  configureApi,
  createSessionStore,
  setDisplayCountry,
  type AdminState,
  type BusinessState,
  type KeyValueStorage,
  type SessionState,
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
      // Preference just won't survive a reload.
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

/** "Chrome on Windows" style label for the sessions list; never a fingerprint. */
function deviceLabel(): string {
  if (typeof navigator === "undefined") return "Web browser";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/** One store per browser tab; the logic lives in @repo/core (shared with mobile). */
export const sessionStore = createSessionStore({ storage: webStorage, deviceLabel });

// Browser transport: HttpOnly session cookie + CSRF header; credentials never touch JS storage.
if (typeof window !== "undefined") {
  configureApi({
    baseUrl: API_BASE_URL,
    transport: "BROWSER",
    onUnauthenticated: () => {
      if (sessionStore.getState().status !== "signedOut") void sessionStore.expire();
    },
  });
  sessionStore.subscribe(() => {
    const state = sessionStore.getState();
    if (state.status === "business") setDisplayCountry(state.organization.country);
  });
}

const LOADING: SessionState = { status: "loading" };

export function useSession(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState, () => LOADING);
}

/** For components rendered inside a business guard (see RequireOrg). */
export function useBusiness(): BusinessState {
  const state = useSession();
  if (state.status !== "business") throw new Error("useBusiness used outside a business route");
  return state;
}

/** For components inside the admin shell (see RequireAdmin). */
export function useAdminSession(): AdminState {
  const state = useSession();
  if (state.status !== "admin") throw new Error("useAdminSession used outside the admin shell");
  return state;
}

export const ADMIN_HOME = "/admin";

/** Where a settled session lands: the admin shell, the organization's shell, or login. */
export function homeFor(state: SessionState): string {
  if (state.status === "admin") return ADMIN_HOME;
  if (state.status === "business") return state.organization.type === "VENDOR" ? "/vendor" : "/buyer";
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
