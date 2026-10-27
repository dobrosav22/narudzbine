import {
  BarChart3Icon,
  BellIcon,
  Building2Icon,
  ClipboardListIcon,
  FileClockIcon,
  FilePenLineIcon,
  HeartIcon,
  InboxIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  PackageIcon,
  SettingsIcon,
  ShoppingCartIcon,
  StoreIcon,
  TruckIcon,
  UsersIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";
import type { Messages } from "@repo/core";

export type NavKey = keyof Messages["nav"];

export interface NavItem {
  /** Translation key under `nav`. */
  title: NavKey;
  icon: LucideIcon;
  href: string;
  /** Active only on exactly href, plus `alsoActiveUnder` prefixes (default: any path under href). */
  exact?: boolean;
  alsoActiveUnder?: string[];
  /** Live count shown on the item. */
  badge?: "cart" | "unread";
}

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.alsoActiveUnder?.some((p) => pathname.startsWith(p))) return true;
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export type ShellKind = "vendor" | "buyer" | "admin";

/** One entry per route group (fixed route map in docs/frontend/integration-guide.md and the area briefs). */
export const NAV: Record<ShellKind, NavItem[]> = {
  vendor: [
    { title: "dashboard", icon: LayoutDashboardIcon, href: "/vendor", exact: true },
    { title: "catalogue", icon: PackageIcon, href: "/vendor/catalogue" },
    { title: "orders", icon: ClipboardListIcon, href: "/vendor/orders" },
    { title: "buyers", icon: UsersIcon, href: "/vendor/buyers" },
    { title: "stats", icon: BarChart3Icon, href: "/vendor/stats" },
    { title: "notifications", icon: InboxIcon, href: "/vendor/notifications", badge: "unread" },
    { title: "team", icon: UsersRoundIcon, href: "/vendor/team" },
    { title: "locations", icon: MapPinIcon, href: "/vendor/locations" },
    { title: "settings", icon: SettingsIcon, href: "/vendor/settings" },
  ],
  buyer: [
    { title: "browse", icon: StoreIcon, href: "/buyer", exact: true, alsoActiveUnder: ["/buyer/products"] },
    { title: "cart", icon: ShoppingCartIcon, href: "/buyer/cart", badge: "cart", alsoActiveUnder: ["/buyer/checkout"] },
    { title: "drafts", icon: FilePenLineIcon, href: "/buyer/drafts" },
    { title: "favorites", icon: HeartIcon, href: "/buyer/favorites" },
    { title: "orders", icon: ClipboardListIcon, href: "/buyer/orders" },
    { title: "vendors", icon: TruckIcon, href: "/buyer/vendors" },
    { title: "stats", icon: BarChart3Icon, href: "/buyer/stats" },
    { title: "notifications", icon: InboxIcon, href: "/buyer/notifications", badge: "unread" },
    { title: "settings", icon: SettingsIcon, href: "/buyer/settings" },
  ],
  admin: [
    { title: "dashboard", icon: LayoutDashboardIcon, href: "/admin", exact: true },
    { title: "organizations", icon: Building2Icon, href: "/admin/organizations" },
    { title: "planRequests", icon: BellIcon, href: "/admin/plan-requests" },
    { title: "audit", icon: FileClockIcon, href: "/admin/audit" },
  ],
};
