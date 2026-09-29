import {
  BarChart3Icon,
  Building2Icon,
  ClipboardListIcon,
  HeartIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  PackageIcon,
  SettingsIcon,
  ShoppingCartIcon,
  StoreIcon,
  UsersIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";
import type { OrgType } from "@repo/core";

export interface NavItem {
  /** Translation key (i18n → nav.*). */
  title: string;
  icon: LucideIcon;
  /** Absent = screen not built yet; rendered disabled with a "Soon" badge. */
  href?: string;
  /** Active only on exactly href, plus these prefixes (default: any path under href). */
  exact?: boolean;
  alsoActiveUnder?: string[];
  /** Live count shown on the item. */
  badge?: "cart";
}

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (!item.href) return false;
  if (item.alsoActiveUnder?.some((p) => pathname.startsWith(p))) return true;
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/** 03 → "Navigation shape". Items gain an href as each screen lands. */
/** v1.1: the admin shell is web-only (02 "Admin panel"). */
export type ShellKind = OrgType | "admin";

export const NAV: Record<ShellKind, NavItem[]> = {
  vendor: [
    { title: "nav.dashboard", icon: LayoutDashboardIcon, href: "/vendor", exact: true },
    { title: "nav.catalogue", icon: PackageIcon, href: "/vendor/catalogue" },
    { title: "nav.orders", icon: ClipboardListIcon, href: "/vendor/orders" },
    { title: "nav.buyers", icon: UsersIcon, href: "/vendor/buyers" },
    { title: "nav.locations", icon: MapPinIcon, href: "/vendor/locations" },
    { title: "nav.stats", icon: BarChart3Icon, href: "/vendor/stats" },
    { title: "nav.team", icon: UsersRoundIcon, href: "/vendor/team" },
    { title: "nav.settings", icon: SettingsIcon, href: "/vendor/settings" },
  ],
  buyer: [
    { title: "nav.home", icon: StoreIcon, href: "/buyer", exact: true, alsoActiveUnder: ["/buyer/products"] },
    { title: "nav.cart", icon: ShoppingCartIcon, href: "/buyer/cart", badge: "cart", alsoActiveUnder: ["/buyer/checkout"] },
    { title: "nav.orders", icon: ClipboardListIcon, href: "/buyer/orders" },
    { title: "nav.favorites", icon: HeartIcon, href: "/buyer/favorites" },
    { title: "nav.stats", icon: BarChart3Icon, href: "/buyer/stats" },
    { title: "nav.settings", icon: SettingsIcon, href: "/buyer/settings" },
  ],
  admin: [
    { title: "nav.dashboard", icon: LayoutDashboardIcon, href: "/admin", exact: true },
    { title: "nav.vendors", icon: Building2Icon, href: "/admin/vendors" },
    { title: "nav.buyers", icon: UsersIcon, href: "/admin/buyers" },
  ],
};
