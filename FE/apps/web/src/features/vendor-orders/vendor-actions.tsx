"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, PackageCheckIcon, SettingsIcon, TruckIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { canConfigureStages, orderActions, sortedStages, type Order, type Role } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionError } from "@/features/orders/action-error";
import { ConfirmDialog } from "@/features/orders/confirm-dialog";
import { ReasonDialog } from "@/features/orders/reason-dialog";
import {
  useAcceptOrder,
  useCancelOrder,
  useDeliverOrder,
  useDispatchOrder,
  useFulfillmentLocations,
  useOrderStages,
  useRejectOrder,
  useSetOrderStage,
} from "@/features/orders/queries";

const NONE = "none";
type Dialog = "accept" | "reject" | "cancel" | "dispatch" | "deliver" | null;

/**
 * Vendor lifecycle controls for the current core state: accept (optional fulfillment location) or
 * reject an awaiting order; set the optional custom stage, dispatch (blocked by a pending
 * cancellation request) or cancel an accepted one; mark a dispatched one delivered. Every action
 * sends the current Order revision; the backend decides.
 */
export function VendorOrderActions({ order, role }: { order: Order; role: Role | null }) {
  const t = useTranslations("vendorOrders");
  const actions = orderActions(order, { side: "VENDOR", role, staffSubmissionRestricted: false });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [locationId, setLocationId] = useState(NONE);
  const accept = useAcceptOrder();
  const reject = useRejectOrder();
  const cancel = useCancelOrder();
  const dispatch = useDispatchOrder();
  const deliver = useDeliverOrder();
  const setStage = useSetOrderStage();
  const locations = useFulfillmentLocations(dialog === "accept");
  const stages = useOrderStages(actions.setStage);
  const ref = { orderId: order.id, expectedRevision: order.revision };
  const any = actions.accept || actions.setStage || actions.dispatch || actions.deliver || actions.cancel;
  if (!any) return null;

  const close = () => {
    setDialog(null);
    for (const m of [accept, reject, cancel, dispatch, deliver]) m.reset();
  };
  const done = (message: string) => () => {
    toast.success(message);
    setDialog(null);
  };

  const activeStages = stages.data ? sortedStages(stages.data).filter((s) => s.state === "ACTIVE") : [];
  const currentRetired = stages.data?.stages.find((s) => s.id === order.stageId && s.state === "RETIRED");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("actionsTitle")}</CardTitle>
        <CardDescription>{t("actionsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {actions.setStage && (
          <Field className="max-w-sm">
            <FieldLabel htmlFor="order-stage">{t("stage")}</FieldLabel>
            <Select
              value={order.stageId ?? NONE}
              disabled={setStage.isPending || !stages.data}
              onValueChange={(v) => {
                const stageId = v === NONE ? null : v;
                if (stageId === order.stageId) return;
                setStage.mutate(
                  { ...ref, stageId },
                  { onSuccess: (o) => toast.success(o.stageName ? t("stageSet", { stage: o.stageName }) : t("stageCleared")) },
                );
              }}
            >
              <SelectTrigger id="order-stage" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE}>{t("noStage")}</SelectItem>
                  {activeStages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                  {currentRetired && (
                    <SelectItem value={currentRetired.id} disabled>
                      {t("retiredStage", { name: currentRetired.name })}
                    </SelectItem>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {activeStages.length === 0 && stages.data ? t("noStagesConfigured") : t("stageHint")}
              {canConfigureStages(role) && (
                <>
                  {" "}
                  <Link href="/vendor/settings/stages" className="inline-flex items-center gap-1 underline underline-offset-4">
                    <SettingsIcon className="size-3" />
                    {t("manageStages")}
                  </Link>
                </>
              )}
            </FieldDescription>
            <ActionError error={setStage.error} />
          </Field>
        )}

        <div className="flex flex-wrap gap-2">
          {actions.accept && (
            <Button onClick={() => setDialog("accept")}>
              <CheckIcon data-icon="inline-start" />
              {t("accept")}
            </Button>
          )}
          {actions.reject && (
            <Button variant="outline" onClick={() => setDialog("reject")}>
              <XCircleIcon data-icon="inline-start" />
              {t("reject")}
            </Button>
          )}
          {order.state === "ACCEPTED" && (
            <Button disabled={!actions.dispatch} onClick={() => setDialog("dispatch")}>
              <TruckIcon data-icon="inline-start" />
              {t("dispatch")}
            </Button>
          )}
          {actions.deliver && (
            <Button onClick={() => setDialog("deliver")}>
              <PackageCheckIcon data-icon="inline-start" />
              {t("deliver")}
            </Button>
          )}
          {actions.cancel && (
            <Button variant="destructive" className="ml-auto" onClick={() => setDialog("cancel")}>
              <XCircleIcon data-icon="inline-start" />
              {t("cancel")}
            </Button>
          )}
        </div>
        {order.state === "ACCEPTED" && !actions.dispatch && <p className="text-sm text-muted-foreground">{t("dispatchBlocked")}</p>}
      </CardContent>

      <ConfirmDialog
        open={dialog === "accept"}
        onOpenChange={(o) => (o ? setDialog("accept") : close())}
        title={t("acceptTitle", { number: order.number })}
        description={t("acceptDescription", { buyer: order.buyer.displayName })}
        confirmLabel={t("accept")}
        pending={accept.isPending}
        error={accept.error}
        onConfirm={() =>
          accept.mutate(
            { ...ref, fulfillmentLocationId: locationId === NONE ? null : locationId },
            { onSuccess: done(t("accepted", { number: order.number })) },
          )
        }
      >
        <Field>
          <FieldLabel htmlFor="fulfillment-location">{t("fulfillmentLocation")}</FieldLabel>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger id="fulfillment-location" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{t("noFulfillmentLocation")}</SelectItem>
                {locations.data?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {`${l.name} · ${l.address.city}`}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>{t("fulfillmentHint")}</FieldDescription>
          <ActionError error={locations.error} />
        </Field>
      </ConfirmDialog>

      <ReasonDialog
        open={dialog === "reject"}
        onOpenChange={(o) => (o ? setDialog("reject") : close())}
        title={t("rejectTitle", { number: order.number })}
        description={t("rejectDescription", { buyer: order.buyer.displayName })}
        confirmLabel={t("reject")}
        destructive
        pending={reject.isPending}
        error={reject.error}
        onConfirm={(reason) => reject.mutate({ ...ref, reason }, { onSuccess: done(t("rejected", { number: order.number })) })}
      />

      <ReasonDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => (o ? setDialog("cancel") : close())}
        title={t("cancelTitle", { number: order.number })}
        description={order.cancellationRequestId ? t("cancelDescriptionPending") : t("cancelDescription", { buyer: order.buyer.displayName })}
        confirmLabel={t("cancel")}
        destructive
        pending={cancel.isPending}
        error={cancel.error}
        onConfirm={(reason) => cancel.mutate({ ...ref, reason }, { onSuccess: done(t("cancelled", { number: order.number })) })}
      />

      <ConfirmDialog
        open={dialog === "dispatch"}
        onOpenChange={(o) => (o ? setDialog("dispatch") : close())}
        title={t("dispatchTitle", { number: order.number })}
        description={t("dispatchDescription")}
        confirmLabel={t("dispatch")}
        pending={dispatch.isPending}
        error={dispatch.error}
        onConfirm={() => dispatch.mutate(ref, { onSuccess: done(t("dispatched", { number: order.number })) })}
      />

      <ConfirmDialog
        open={dialog === "deliver"}
        onOpenChange={(o) => (o ? setDialog("deliver") : close())}
        title={t("deliverTitle", { number: order.number })}
        description={t("deliverDescription")}
        confirmLabel={t("deliver")}
        pending={deliver.isPending}
        error={deliver.error}
        onConfirm={() => deliver.mutate(ref, { onSuccess: done(t("delivered", { number: order.number })) })}
      />
    </Card>
  );
}
