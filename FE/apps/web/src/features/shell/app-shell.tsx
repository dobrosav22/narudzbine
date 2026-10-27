"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatNumber, unreadBadge } from "@repo/core";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
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
} from "@/components/ui/sidebar";
import { useUnreadNotifications } from "@/features/account/queries";
import { useCart } from "@/lib/cart";
import { isNavActive, NAV, type ShellKind } from "./nav";
import { UserMenu } from "./user-menu";
import { VendorSwitcher } from "./vendor-switcher";

/** Vendor, buyer and (web-only) platform-admin shells: the same frame with a different nav. */
export function AppShell({ kind, children }: { kind: ShellKind; children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations();
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:hidden">
            <Link href="/" className="font-semibold tracking-tight text-primary">
              Narudžbine
            </Link>
            {kind === "admin" && <Badge variant="secondary">{t("shell.adminBadge")}</Badge>}
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
                      <Link href={item.href}>
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
        </header>
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
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
