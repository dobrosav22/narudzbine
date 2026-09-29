"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { USE_MOCKS } from "@repo/core";
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
import { formatNumber } from "@repo/core";
import { useCart } from "@/lib/cart";
import { AdminUserMenu } from "./admin-user-menu";
import { isNavActive, NAV, type ShellKind } from "./nav";
import { UserMenu } from "./user-menu";
import { VendorSwitcher } from "./vendor-switcher";

/** Vendor, buyer and (v1.1, web-only) admin shells (03 → "Navigation shape") — same frame, different nav. */
export function AppShell({ orgType, children }: { orgType: ShellKind; children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations();
  const tk = t as unknown as (key: string) => string;
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:hidden">
            <Link href="/" className="font-semibold tracking-tight text-primary">
              Narudžbine
            </Link>
            {USE_MOCKS && <Badge variant="outline">{t("common.mockData")}</Badge>}
            {orgType === "admin" && <Badge variant="secondary">{t("shell.adminBadge")}</Badge>}
          </div>
          {orgType === "buyer" && <VendorSwitcher />}
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV[orgType].map((item) => (
                  <SidebarMenuItem key={item.title}>
                    {item.href ? (
                      <SidebarMenuButton asChild isActive={isNavActive(item, pathname)} tooltip={tk(item.title)}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{tk(item.title)}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : null}
                    {item.href && item.badge === "cart" && <CartBadge />}
                    {!item.href && (
                      <>
                        <SidebarMenuButton disabled tooltip={t("shell.comingSoon", { item: tk(item.title) })}>
                          <item.icon />
                          <span>{tk(item.title)}</span>
                        </SidebarMenuButton>
                        <SidebarMenuBadge>{t("shell.soon")}</SidebarMenuBadge>
                      </>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          {orgType === "admin" ? <AdminUserMenu /> : <UserMenu />}
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

/** Live item count on the Cart nav item; hidden when empty. */
function CartBadge() {
  const t = useTranslations("shell");
  const { itemCount } = useCart();
  if (!itemCount) return null;
  return (
    <SidebarMenuBadge aria-label={t("itemsInCart", { count: itemCount, countText: formatNumber(itemCount) })}>{formatNumber(itemCount)}</SidebarMenuBadge>
  );
}
