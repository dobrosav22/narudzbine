"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { ChevronsUpDownIcon, LanguagesIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { toast } from "sonner";
import { SUPPORTED_LOCALES, type AppLocale } from "@repo/core";
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
import { changeLocale, useErrorText, useUiLocale } from "@/lib/i18n";
import { initials, sessionStore, useAdminSession } from "@/lib/session";

/**
 * Admin shell footer: who you are, theme, language (01 §12 — the admin has no profile page, so
 * it lives here), sign out. No org switcher (the admin belongs to no
 * org) and no profile/notification pages — the account is a single seeded one (02 v1.1).
 */
export function AdminUserMenu() {
  const router = useRouter();
  const { admin } = useAdminSession();
  const { theme, setTheme } = useTheme();
  const t = useTranslations();
  const locale = useUiLocale();
  const errorText = useErrorText();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label={t("shell.accountMenu")}>
              <Avatar className="size-8 rounded-md">
                <AvatarFallback className="rounded-md">{initials(admin.name)}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col gap-0.5 leading-none">
                <span className="truncate font-medium">{admin.name}</span>
                <span className="truncate text-xs text-muted-foreground">{t("shell.platformAdmin")}</span>
              </span>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <span className="block font-medium">{admin.name}</span>
                <span className="block text-xs text-muted-foreground">{admin.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
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
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <LanguagesIcon />
                  {t("common.language")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={locale}
                    onValueChange={(v) => void changeLocale(v as AppLocale).catch((e: unknown) => toast.error(errorText(e)))}
                  >
                    {SUPPORTED_LOCALES.map((l) => (
                      <DropdownMenuRadioItem key={l.value} value={l.value} lang={l.value}>
                        {l.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={() => void sessionStore.signOut().then(() => router.replace("/login"))}>
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
