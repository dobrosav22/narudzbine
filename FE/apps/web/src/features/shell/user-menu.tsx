"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  BellIcon,
  ChevronsUpDownIcon,
  LanguagesIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  ShieldIcon,
  SunIcon,
  UserRoundIcon,
} from "lucide-react";
import { toast } from "sonner";
import { BACKEND_LOCALES, isBackendLocale } from "@repo/core";
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
import { changeLanguage, useErrorText } from "@/lib/i18n";
import { initials, sessionStore, useSession } from "@/lib/session";
import type { ShellKind } from "./nav";

const INHERIT = "inherit";

/** Sidebar footer: who you are, account pages, language, theme and sign out. No organization switcher exists. */
export function UserMenu({ kind }: { kind: ShellKind }) {
  const router = useRouter();
  const state = useSession();
  const { theme, setTheme } = useTheme();
  const t = useTranslations();
  const errorText = useErrorText();
  if (state.status !== "business" && state.status !== "admin") return null;
  const { account } = state;
  const subtitle = state.status === "business" ? state.organization.displayName : t("shell.platformAdmin");
  const base = `/${kind}/account`;
  const defaultLabel =
    state.status === "business"
      ? t("shell.languageDefault", { language: BACKEND_LOCALES.find((l) => l.value === state.organization.defaultLanguage)?.label ?? "" })
      : t("shell.languageDefault", { language: "English" });

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label={t("shell.accountMenu")}>
              <Avatar className="size-8 rounded-md">
                <AvatarFallback className="rounded-md">{initials(account.displayName)}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col gap-0.5 leading-none">
                <span className="truncate font-medium">{account.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
              </span>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <span className="block font-medium">{account.displayName}</span>
                <span className="block text-xs text-muted-foreground">{account.email}</span>
                {account.role && <span className="block text-xs text-muted-foreground">{t(`shell.roles.${account.role}`)}</span>}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href={base}>
                  <UserRoundIcon />
                  {t("shell.profile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`${base}/security`}>
                  <ShieldIcon />
                  {t("shell.security")}
                </Link>
              </DropdownMenuItem>
              {kind !== "admin" && (
                <DropdownMenuItem asChild>
                  <Link href={`${base}/notifications`}>
                    <BellIcon />
                    {t("shell.notificationSettings")}
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <LanguagesIcon />
                  {t("common.language")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={account.languageOverride ?? INHERIT}
                    onValueChange={(v) => {
                      const next = v === INHERIT ? null : isBackendLocale(v) ? v : null;
                      void changeLanguage(next).catch((e: unknown) => toast.error(errorText(e)));
                    }}
                  >
                    <DropdownMenuRadioItem value={INHERIT}>{defaultLabel}</DropdownMenuRadioItem>
                    {BACKEND_LOCALES.map((l) => (
                      <DropdownMenuRadioItem key={l.value} value={l.value} lang={l.value}>
                        {l.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
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
              <DropdownMenuItem onSelect={() => void sessionStore.logout().then(() => router.replace("/login"))}>
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
