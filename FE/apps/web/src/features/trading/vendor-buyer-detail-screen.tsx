"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, ClipboardListIcon, UserXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDate, isApiError, isOrgAdmin, type Invitation } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBusiness } from "@/lib/session";
import { AgreedPricesCard } from "./agreed-prices-card";
import { InviteEmailForm } from "./invite-dialog";
import { DisconnectDialog, PartnerDetailsCard, RelationshipStateBadge } from "./parts";
import { usePartner, useRelationship } from "./queries";

/** Vendor → one buyer relationship: partner details, state, agreed prices, orders link, disconnect/reconnect. */
export function VendorBuyerDetailScreen({ relationshipId }: { relationshipId: string }) {
  const t = useTranslations("vendorBuyers.detail");
  const session = useBusiness();
  const admin = isOrgAdmin(session);
  const relationship = useRelationship(relationshipId);
  const partner = usePartner(relationship.data?.buyerId);

  if (relationship.isError) {
    return isApiError(relationship.error, "NOT_FOUND") ? (
      <EmptyState icon={UserXIcon} title={t("notFoundTitle")} description={t("notFoundDescription")}>
        <Button asChild variant="outline">
          <Link href="/vendor/buyers">{t("allBuyers")}</Link>
        </Button>
      </EmptyState>
    ) : (
      <ErrorState error={relationship.error} onRetry={() => void relationship.refetch()} />
    );
  }
  if (relationship.isPending) return <RowsSkeleton rows={6} />;
  const r = relationship.data;
  const name = partner.data?.displayName ?? t("formerBuyer");
  const active = r.state === "ACTIVE";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link href="/vendor/buyers">
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
          <Button asChild variant="outline">
            <Link href={`/vendor/orders?partnerId=${r.buyerId}`}>
              <ClipboardListIcon data-icon="inline-start" />
              {t("orders")}
            </Link>
          </Button>
          {admin && active && <DisconnectDialog relationship={r} partnerName={name} />}
        </div>
      </div>

      {!active && r.disconnectedReason && (
        <Alert>
          <AlertTitle>{t("disconnectedTitle")}</AlertTitle>
          <AlertDescription>{t("reason", { reason: r.disconnectedReason })}</AlertDescription>
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

      {!active && admin && <ReconnectCard buyerId={r.buyerId} name={name} />}

      <AgreedPricesCard relationship={r} currency={session.organization.currency} partnerName={name} />
    </div>
  );
}

function ReconnectCard({ buyerId, name }: { buyerId: string; name: string }) {
  const t = useTranslations("vendorBuyers.detail");
  const [sent, setSent] = useState<Invitation>();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reconnectTitle")}</CardTitle>
        <CardDescription>{t("reconnectDescription", { name })}</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p role="status" className="text-sm text-success">
            {t("reconnectSent", { email: sent.recipientEmail })}
          </p>
        ) : (
          <InviteEmailForm formId="reconnect-buyer" buyerOrganizationId={buyerId} onSent={setSent} />
        )}
      </CardContent>
    </Card>
  );
}
