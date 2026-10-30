"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShoppingCartIcon } from "lucide-react";
import { formatNumber, unreadBadge } from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarClose,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useUnreadNotifications } from "@/features/account/queries";
import { useCart } from "@/lib/cart";
import { isNavActive, NAV, type ShellKind } from "./nav";
import { UserMenu } from "./user-menu";
import { VendorSwitcher } from "./vendor-switcher";

/** Vendor, buyer and (web-only) platform-admin shells: the same frame with a different nav. */
export function AppShell({ kind, children }: { kind: ShellKind; children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ShellFrame kind={kind}>{children}</ShellFrame>
    </SidebarProvider>
  );
}

/** Inside the provider, so nav links can close the phone sheet. */
function ShellFrame({ kind, children }: { kind: ShellKind; children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations();
  const { setOpenMobile } = useSidebar();
  return (
    <>
      <CloseMobileMenuOnNavigation />
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex min-h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:hidden">
            <Link href="/" className="font-semibold tracking-tight text-primary">
              Narudžbine
            </Link>
            {kind === "admin" && <Badge variant="secondary">{t("shell.adminBadge")}</Badge>}
            <SidebarClose className="-mr-2 ml-auto" aria-label={t("nav.closeMenu")} />
          </div>
          {kind === "buyer" && <VendorSwitcher />}
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu aria-label={t("nav.mainNavigation")}>
                {NAV[kind].map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isNavActive(item, pathname)} tooltip={t(`nav.${item.title}`)}>
                      <Link href={item.href} onClick={() => setOpenMobile(false)}>
                        <item.icon />
                        <span>{t(`nav.${item.title}`)}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badge === "cart" && <CartBadge />}
                    {item.badge === "unread" && <UnreadBadge />}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <UserMenu kind={kind} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <PhoneHeader kind={kind} pathname={pathname} />
        </header>
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</div>
      </SidebarInset>
    </>
  );
}

/** Below md the sidebar is hidden: name the current section, and give buyers a direct way to the cart. */
function PhoneHeader({ kind, pathname }: { kind: ShellKind; pathname: string }) {
  const t = useTranslations();
  const { itemCount } = useCart();
  const item = NAV[kind].find((i) => isNavActive(i, pathname));
  const title = item ? t(`nav.${item.title}`) : pathname.startsWith(`/${kind}/account`) ? t("nav.account") : "Narudžbine";
  return (
    <>
      <span className="min-w-0 flex-1 truncate font-medium md:hidden">{title}</span>
      {kind === "buyer" && (
        <Button asChild variant="ghost" size="icon" className="relative md:hidden">
          <Link
            href="/buyer/cart"
            aria-label={itemCount ? t("shell.itemsInCart", { count: itemCount, countText: formatNumber(itemCount) }) : t("nav.cart")}
          >
            <ShoppingCartIcon />
            {itemCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 tabular-nums">{formatNumber(itemCount)}</Badge>
            )}
          </Link>
        </Button>
      )}
    </>
  );
}

/**
 * Closes the phone menu sheet after any navigation, including links outside the nav list
 * (brand, account menu). Tapping the page already open is handled by the nav links themselves.
 */
function CloseMobileMenuOnNavigation() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile]);
  return null;
}

/** Live item count on the Cart nav item (local cart, owned by the buyer catalogue area); hidden when empty. */
function CartBadge() {
  const t = useTranslations("shell");
  const { itemCount } = useCart();
  if (!itemCount) return null;
  return (
    <SidebarMenuBadge aria-label={t("itemsInCart", { count: itemCount, countText: formatNumber(itemCount) })}>{formatNumber(itemCount)}</SidebarMenuBadge>
  );
}

/** Unread inbox entries (first page of unread items; "99+" beyond). */
function UnreadBadge() {
  const t = useTranslations("shell");
  const unread = useUnreadNotifications();
  const label = unread.data ? unreadBadge(unread.data.count, unread.data.more) : null;
  if (!label || !unread.data) return null;
  return <SidebarMenuBadge aria-label={t("unreadCount", { count: unread.data.count, countText: label })}>{label}</SidebarMenuBadge>;
}
