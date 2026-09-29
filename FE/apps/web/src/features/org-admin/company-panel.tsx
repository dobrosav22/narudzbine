"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatDate, isServiceError, type OrgType } from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { FormError } from "@/features/auth/form-error";
import { useVendorOrg } from "@/features/vendor-catalogue/queries";
import { useBuyerOrg, useUpdateCompany } from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText } from "@/lib/i18n";

/**
 * Company details: the name (both sides) and, for vendors, inventory tracking (01 §3).
 * Tracking had no switch anywhere before — a new vendor starts with it off.
 */
export function CompanyPanel({ orgType, orgId }: { orgType: OrgType; orgId: string }) {
  return orgType === "vendor" ? <VendorCompany orgId={orgId} /> : <BuyerCompany orgId={orgId} />;
}

function VendorCompany({ orgId }: { orgId: string }) {
  const org = useVendorOrg(orgId);
  if (org.isError) return <ErrorState error={org.error} onRetry={() => void org.refetch()} />;
  if (org.isPending) return <RowsSkeleton rows={3} />;
  return (
    <div className="flex flex-col gap-4">
      <NameCard orgType="vendor" orgId={orgId} name={org.data.name} createdAt={org.data.createdAt} />
      <InventoryCard orgId={orgId} tracksInventory={org.data.tracksInventory} />
    </div>
  );
}

function BuyerCompany({ orgId }: { orgId: string }) {
  const org = useBuyerOrg(orgId);
  if (org.isError) return <ErrorState error={org.error} onRetry={() => void org.refetch()} />;
  if (org.isPending) return <RowsSkeleton rows={2} />;
  return <NameCard orgType="buyer" orgId={orgId} name={org.data.name} createdAt={org.data.createdAt} />;
}

function NameCard({ orgType, orgId, name, createdAt }: { orgType: OrgType; orgId: string; name: string; createdAt: string }) {
  const t = useTranslations("settings.company");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const [value, setValue] = useState(name);
  const update = useUpdateCompany({ orgType, orgId });
  const invalid = !value.trim();
  const fieldError = isServiceError(update.error, "VALIDATION") ? errorText(update.error) : invalid ? t("nameRequired") : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {orgType === "vendor" ? t("vendorNote") : t("buyerNote")} {t("since", { date: formatDate(createdAt) })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="company-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (invalid) return;
            update.mutate({ name: value }, { onSuccess: () => toast.success(t("saved")) });
          }}
        >
          <FieldGroup>
            {update.error && !isServiceError(update.error, "VALIDATION") && <FormError error={update.error} />}
            <Field data-invalid={!!fieldError || undefined}>
              <FieldLabel htmlFor="company-name">{t("name")}</FieldLabel>
              <Input
                id="company-name"
                className="max-w-md"
                value={value}
                aria-invalid={!!fieldError || undefined}
                onChange={(e) => {
                  if (update.error) update.reset();
                  setValue(e.target.value);
                }}
              />
              {fieldError && <FieldError>{fieldError}</FieldError>}
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" disabled={value === name || update.isPending} onClick={() => setValue(name)}>
          {tc("discard")}
        </Button>
        <Button type="submit" form="company-form" disabled={value.trim() === name || invalid || update.isPending}>
          {update.isPending && <Spinner data-icon="inline-start" />}
          {tc("save")}
        </Button>
      </CardFooter>
    </Card>
  );
}

function InventoryCard({ orgId, tracksInventory }: { orgId: string; tracksInventory: boolean }) {
  const t = useTranslations("settings.inventory");
  const errorText = useErrorText();
  const update = useUpdateCompany({ orgType: "vendor", orgId });
  const [confirmOff, setConfirmOff] = useState(false);
  const set = (on: boolean) =>
    update.mutate(
      { tracksInventory: on },
      {
        onSuccess: () => toast.success(on ? t("on") : t("off")),
        onError: (e) => toast.error(errorText(e)),
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="tracks-inventory">{t("track")}</FieldLabel>
            <FieldDescription>{t("trackDescription")}</FieldDescription>
          </FieldContent>
          <Switch
            id="tracks-inventory"
            checked={tracksInventory}
            disabled={update.isPending}
            // Turning it off drops every stock number, so that direction asks first.
            onCheckedChange={(on) => (on ? set(true) : setConfirmOff(true))}
          />
        </Field>
      </CardContent>

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("stopTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("stopDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => set(false)}>
              {t("stop")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
