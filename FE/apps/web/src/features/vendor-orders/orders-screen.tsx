"use client";

import { useTranslations } from "next-intl";
import { OrdersList } from "@/features/orders/orders-list";

/** Vendor "Orders": incoming orders from every buyer (GET /orders). */
export function VendorOrdersScreen() {
  const t = useTranslations("orders");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("vendorSubtitle")}</p>
      </div>
      <OrdersList side="VENDOR" basePath="/vendor/orders" />
    </div>
  );
}
