"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ClipboardListIcon, InfoIcon, StoreIcon, UserXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDate, isApiError, isOrgAdmin, type Relationship } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { sessionStore, useBusiness } from "@/lib/session";
import { DisconnectDialog, PartnerDetailsCard, RelationshipStateBadge } from "./parts";
import { usePartner, useRelationship } from "./queries";

/** Buyer → one vendor relationship: vendor details, state, catalogue and orders links, disconnect. */
export function BuyerVendorDetailScreen({ relationshipId }: { relationshipId: string }) {
  const t = useTranslations("trdVendors.detail");
  const router = useRouter();
  const session = useBusiness();
  const relationship = useRelationship(relationshipId);
  const partner = usePartner(relationship.data?.vendorId);

  if (relationship.isError) {
    return isApiError(relationship.error, "NOT_FOUND") ? (
      <EmptyState icon={UserXIcon} title={t("notFoundTitle")} description={t("notFoundDescription")}>
        <Button asChild variant="outline">
          <Link href="/buyer/vendors">{t("allVendors")}</Link>
        </Button>
      </EmptyState>
    ) : (
      <ErrorState error={relationship.error} onRetry={() => void relationship.refetch()} />
    );
  }
  if (relationship.isPending) return <RowsSkeleton rows={6} />;
  const r = relationship.data;
  const name = partner.data?.displayName ?? t("formerVendor");
  const active = r.state === "ACTIVE";

  // Leaving the vendor whose catalogue is open would strand the buyer screens on a closed catalogue.
  const onDisconnected = (updated: Relationship) => {
    if (session.activeVendorId === updated.vendorId) void sessionStore.selectVendor(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link href="/buyer/vendors">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 basis-56 flex-col">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {partner.isPending ? " " : name}
            <RelationshipStateBadge state={r.state} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {active ? t("since", { date: formatDate(r.createdAt) }) : t("disconnectedOn", { date: formatDate(r.updatedAt) })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {active && (
            <Button onClick={() => void sessionStore.selectVendor(r.vendorId).then(() => router.push("/buyer"))}>
              <StoreIcon data-icon="inline-start" />
              {t("browse")}
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/buyer/orders?partnerId=${r.vendorId}`}>
              <ClipboardListIcon data-icon="inline-start" />
              {t("orders")}
            </Link>
          </Button>
          {isOrgAdmin(session) && active && <DisconnectDialog relationship={r} partnerName={name} onDisconnected={onDisconnected} />}
        </div>
      </div>

      {!active && (
        <Alert>
          <AlertTitle>{t("disconnectedTitle")}</AlertTitle>
          <AlertDescription>
            {r.disconnectedReason ? `${t("reason", { reason: r.disconnectedReason })} ` : ""}
            {t("disconnectedNote")}
          </AlertDescription>
        </Alert>
      )}

      {active && r.agreedPriceConfirmationRequired && (
        <Alert>
          <InfoIcon />
          <AlertTitle>{t("pricesReviewTitle")}</AlertTitle>
          <AlertDescription>{t("pricesReviewDescription", { name })}</AlertDescription>
        </Alert>
      )}

      {partner.isError ? (
        isApiError(partner.error, "NOT_FOUND") ? (
          <p className="text-sm text-muted-foreground">{t("noPartnerDetails")}</p>
        ) : (
          <ErrorState error={partner.error} onRetry={() => void partner.refetch()} />
        )
      ) : partner.isPending ? (
        <RowsSkeleton rows={3} />
      ) : (
        <PartnerDetailsCard partner={partner.data} />
      )}
    </div>
  );
}
