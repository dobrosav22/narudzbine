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
import { Skeleton } from "@/components/ui/skeleton";
import { sessionStore } from "@/lib/session";
import { useVendorContext } from "@/features/buyer-catalogue/vendor-context";

/**
 * The buyer's vendor context switcher in the buyer shell — the one place it changes. Catalogue,
 * cart, favorites and checkout follow the active vendor; each vendor keeps its own cart. With a
 * single vendor it is a static label. Rendering it also keeps the remembered vendor valid
 * (auto-selects the first connected vendor when none or a disconnected one is remembered).
 */
export function VendorSwitcher() {
  const t = useTranslations("browse");
  const { vendors, active, isPending } = useVendorContext();

  if (isPending) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center gap-2 p-2" aria-busy="true" aria-label={t("loadingVendors")}>
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="h-4 flex-1" />
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const label = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary-subtle-foreground">
        <StoreIcon />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 leading-none">
        <span className="text-xs text-muted-foreground">{t("orderingFrom")}</span>
        <span className="truncate font-medium">{active?.displayName ?? t("noVendorsYet")}</span>
      </span>
    </>
  );

  if (vendors.length < 2) {
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
                value={active?.vendorId}
                onValueChange={(id) => {
                  if (id === active?.vendorId) return;
                  void sessionStore.selectVendor(id).then(() => {
                    const name = vendors.find((v) => v.vendorId === id)?.displayName ?? "";
                    toast.success(t("nowOrderingFrom", { name }));
                  });
                }}
              >
                {vendors.map((v) => (
                  <DropdownMenuRadioItem key={v.vendorId} value={v.vendorId}>
                    {v.displayName}
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
