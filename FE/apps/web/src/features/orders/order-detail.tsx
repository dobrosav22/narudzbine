"use client";

import Link from "next/link";
import { ArrowLeftIcon, CircleCheckIcon, ClipboardXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDateTime, isApiError, isTerminalOrderState, orderPartner, type Address, type Order, type OrderViewer } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBusiness } from "@/lib/session";
import { CancellationRequestPanel } from "./cancellation-request";
import { OrderLines } from "./order-lines";
import { OrderProgress } from "./order-progress";
import { OrderThread } from "./order-thread";
import { OrderTimeline } from "./order-timeline";
import { useOrder, useOrderPartners } from "./queries";
import { OrderStateBadge } from "./state-badge";

/**
 * Loads one order for either side and renders the shared detail; `actions` renders the side's
 * lifecycle controls. A foreign or unknown id is 404 NOT_FOUND from the backend.
 */
export function OrderDetailLoader({
  orderId,
  listPath,
  placed,
  actions,
}: {
  orderId: string;
  listPath: string;
  placed?: boolean;
  actions: (order: Order, viewer: OrderViewer) => React.ReactNode;
}) {
  const t = useTranslations("orders");
  const order = useOrder(orderId);
  if (order.isError) {
    return isApiError(order.error, "NOT_FOUND") ? (
      <EmptyState icon={ClipboardXIcon} title={t("notFoundTitle")} description={t("notFoundDescription")}>
        <Button asChild variant="outline">
          <Link href={listPath}>{t("allOrders")}</Link>
        </Button>
      </EmptyState>
    ) : (
      <ErrorState error={order.error} onRetry={() => void order.refetch()} />
    );
  }
  if (order.isPending) return <RowsSkeleton rows={6} />;
  return <OrderDetail order={order.data} listPath={listPath} placed={placed} actions={actions} />;
}

function OrderDetail({
  order,
  listPath,
  placed,
  actions,
}: {
  order: Order;
  listPath: string;
  placed?: boolean;
  actions: (order: Order, viewer: OrderViewer) => React.ReactNode;
}) {
  const t = useTranslations("orders");
  const { account, organization } = useBusiness();
  const side = organization.type === "BUYER" ? "BUYER" : "VENDOR";
  const viewer: OrderViewer = { side, role: account.role, staffSubmissionRestricted: organization.staffSubmissionRestricted };
  const partner = orderPartner(order, side);
  const partners = useOrderPartners();
  const partnerRecord = partners.data?.find((p) => p.id === partner.organizationId);
  const partnerHref = partnerRecord
    ? side === "BUYER"
      ? `/buyer/vendors/${partnerRecord.relationshipId}`
      : `/vendor/buyers/${partnerRecord.relationshipId}`
    : undefined;
  const readOnlyThread = partnerRecord?.relationshipState === "DISCONNECTED" && isTerminalOrderState(order.state);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("backToOrders")}>
          <Link href={listPath}>
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {t.rich("heading", { number: order.number, mono: (chunks) => <span className="font-mono">{chunks}</span> })}
            <OrderStateBadge state={order.state} stageName={order.stageName} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {order.submittedByDisplayName
              ? t("submittedAtBy", { partner: partner.displayName, when: formatDateTime(order.submittedAt), name: order.submittedByDisplayName })
              : t("submittedAt", { partner: partner.displayName, when: formatDateTime(order.submittedAt) })}
          </p>
          {order.replacementForOrderId && <ReplacementLink orderId={order.replacementForOrderId} listPath={listPath} />}
        </div>
      </div>

      {placed && (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>{t("placedTitle")}</AlertTitle>
          <AlertDescription>{t("placedDescription", { vendor: order.vendor.displayName })}</AlertDescription>
        </Alert>
      )}

      <OrderProgress
        state={order.state}
        stageName={order.stageName}
        endedNote={order.state === "REJECTED" ? t("rejectedNote") : t("cancelledNote")}
      />

      <CancellationRequestPanel order={order} viewer={viewer} />

      {actions(order, viewer)}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("items")}</CardTitle>
            <CardDescription>{t("asSubmitted")}</CardDescription>
          </CardHeader>
          <CardContent>
            <OrderLines order={order} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{side === "BUYER" ? t("vendor") : t("buyer")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {partnerHref ? (
                <Link href={partnerHref} className="font-medium hover:underline">
                  {partner.displayName}
                </Link>
              ) : (
                <span className="font-medium">{partner.displayName}</span>
              )}
              {partner.legalName !== partner.displayName && <span className="text-muted-foreground">{partner.legalName}</span>}
              <span className="text-muted-foreground">{t("registration", { id: partner.registrationIdentifier })}</span>
              {partner.taxIdentifier && <span className="text-muted-foreground">{t("taxId", { id: partner.taxIdentifier })}</span>}
              <AddressLines address={partner.registeredAddress} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("delivery")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <AddressLines address={order.deliveryAddress} strong />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">{t("contact")}</span>
                <span>{order.deliveryContact.name}</span>
                <span className="text-muted-foreground">{order.deliveryContact.phone}</span>
                {order.deliveryContact.email && <span className="text-muted-foreground">{order.deliveryContact.email}</span>}
              </div>
              {order.deliveryInstructions && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{t("instructions")}</span>
                  <span className="whitespace-pre-wrap">{order.deliveryInstructions}</span>
                </div>
              )}
              {order.fulfillmentLocation && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{t("fulfilledFrom")}</span>
                  <span className="font-medium">{order.fulfillmentLocation.name}</span>
                  <AddressLines address={order.fulfillmentLocation.address} />
                </div>
              )}
            </CardContent>
          </Card>

          {order.note && (
            <Card>
              <CardHeader>
                <CardTitle>{t("note")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{order.note}</CardContent>
            </Card>
          )}
        </div>
      </div>

      <OrderTimeline order={order} ownOrganizationId={organization.id} />

      <OrderThread
        orderId={order.id}
        ownOrganizationId={organization.id}
        ownOrganizationName={organization.displayName}
        ownAccountId={account.id}
        counterpartName={partner.displayName}
        readOnly={readOnlyThread}
      />
    </div>
  );
}

function AddressLines({ address, strong }: { address: Address; strong?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{address.line1}</span>
      {address.line2 && <span className="text-muted-foreground">{address.line2}</span>}
      <span className="text-muted-foreground">{`${address.postalCode} ${address.city}`}</span>
    </span>
  );
}

/** Follows Order.replacementForOrderId with an authorized read of the predecessor. */
function ReplacementLink({ orderId, listPath }: { orderId: string; listPath: string }) {
  const t = useTranslations("orders");
  const previous = useOrder(orderId);
  return (
    <p className="text-sm text-muted-foreground">
      {t.rich("replacementFor", {
        number: previous.data?.number ?? "…",
        link: (chunks) => (
          <Link href={`${listPath}/${orderId}`} className="font-mono underline underline-offset-4">
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}
