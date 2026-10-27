"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { OrdersList } from "./orders-list";

/** Buyer "Orders": this organization's orders with every vendor (GET /orders). */
export function OrdersScreen() {
  const t = useTranslations("orders");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("buyerSubtitle")}</p>
      </div>
      <OrdersList
        side="BUYER"
        basePath="/buyer/orders"
        emptyAction={
          <Button asChild variant="outline">
            <Link href="/buyer">{t("browse")}</Link>
          </Button>
        }
      />
    </div>
  );
}
