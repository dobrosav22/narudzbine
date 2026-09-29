"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { BellIcon, BuildingIcon, ChevronsUpDownIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon, UserRoundIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { homePath, initials, sessionStore, useSignedIn } from "@/lib/session";

/**
 * Sidebar footer: who you are, the org switcher (only when one login holds
 * several memberships — 03 → "Navigation shape"), account (profile, notifications),
 * theme, sign out.
 */
export function UserMenu() {
  const router = useRouter();
  const { session, membership } = useSignedIn();
  const { theme, setTheme } = useTheme();
  const t = useTranslations();
  const multiOrg = session.memberships.length > 1;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label={t("shell.accountMenu")}>
              <Avatar className="size-8 rounded-md">
                <AvatarFallback className="rounded-md">{initials(membership.user.name)}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col gap-0.5 leading-none">
                <span className="truncate font-medium">{membership.user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{membership.org.name}</span>
              </span>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <span className="block font-medium">{membership.user.name}</span>
                <span className="block text-xs text-muted-foreground">{session.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href={`/${membership.orgType}/account`}>
                  <UserRoundIcon />
                  {t("shell.profile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/${membership.orgType}/account/notifications`}>
                  <BellIcon />
                  {t("shell.notifications")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {multiOrg && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">{t("shell.organizations")}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={membership.org.id}
                    onValueChange={(orgId) => {
                      void sessionStore.selectMembership(orgId).then(() => {
                        const s = sessionStore.getState();
                        if (s.status === "signedIn") router.push(homePath(s.membership));
                      });
                    }}
                  >
                    {session.memberships.map((m) => (
                      <DropdownMenuRadioItem key={m.org.id} value={m.org.id}>
                        <BuildingIcon />
                        <span className="flex flex-col">
                          <span>{m.org.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {m.orgType === "vendor" ? t("shell.vendor") : t("shell.buyer")}
                          </span>
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <SunIcon className="dark:hidden" />
                  <MoonIcon className="hidden dark:block" />
                  {t("theme.label")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                    <DropdownMenuRadioItem value="light">
                      <SunIcon />
                      {t("theme.light")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      <MoonIcon />
                      {t("theme.dark")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                      <MonitorIcon />
                      {t("theme.system")}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onSelect={() => {
                  void sessionStore.signOut().then(() => router.replace("/login"));
                }}
              >
                <LogOutIcon />
                {t("shell.logOut")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
