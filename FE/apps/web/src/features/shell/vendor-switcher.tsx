"use client";

import { ChevronsUpDownIcon, StoreIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { sessionStore, useSignedIn } from "@/lib/session";

/**
 * 03: buyers switch "vendor context" here — the one place it changes. Catalogue,
 * cart and orders all read `activeVendor` from the session. With a single
 * vendor it's a static label (no picker to pick from).
 */
export function VendorSwitcher() {
  const t = useTranslations("shell");
  const { connectedVendors, activeVendor } = useSignedIn();
  const label = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary-subtle-foreground">
        <StoreIcon />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 leading-none">
        <span className="text-xs text-muted-foreground">{t("orderingFrom")}</span>
        <span className="truncate font-medium">{activeVendor?.name ?? t("noVendorsYet")}</span>
      </span>
    </>
  );

  if (connectedVendors.length < 2) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center gap-2 p-2 text-sm">{label}</div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label={t("switchVendor")}>
              {label}
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("vendors")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={activeVendor?.id}
                onValueChange={(id) => {
                  void sessionStore.selectVendor(id).then(() => {
                    const name = connectedVendors.find((v) => v.id === id)?.name;
                    toast.success(t("nowOrderingFrom", { name: name ?? "" }));
                  });
                }}
              >
                {connectedVendors.map((v) => (
                  <DropdownMenuRadioItem key={v.id} value={v.id}>
                    {v.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
