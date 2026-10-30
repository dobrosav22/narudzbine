"use client";

import { useState } from "react";
import { AlertCircleIcon, ChevronLeftIcon, ChevronRightIcon, UnplugIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatNumber, isApiError, type Partner, type Relationship } from "@repo/core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useErrorText } from "@/lib/i18n";
import { useDisconnect, usePartner } from "./queries";

/** A failed call's message (backend problem code → text in the UI language). */
export function ProblemAlert({ error }: { error: unknown }) {
  const errorText = useErrorText();
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertDescription>{errorText(error)}</AlertDescription>
    </Alert>
  );
}

/** Offset-page controls for `{ page, size, total }` lists. */
export function Pager({
  page,
  size,
  total,
  itemCount,
  onPage,
}: {
  page: number;
  size: number;
  total: number | null | undefined;
  itemCount: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("trdCommon.pager");
  const pages = total != null ? Math.max(1, Math.ceil(total / size)) : undefined;
  const hasNext = pages !== undefined ? page + 1 < pages : itemCount === size;
  if (page === 0 && !hasNext) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
      <span>{pages !== undefined ? t("pageOf", { page: formatNumber(page + 1), pages: formatNumber(pages) }) : t("page", { page: formatNumber(page + 1) })}</span>
      <Button variant="outline" size="icon-sm" aria-label={t("previous")} disabled={page === 0} onClick={() => onPage(page - 1)}>
        <ChevronLeftIcon />
      </Button>
      <Button variant="outline" size="icon-sm" aria-label={t("next")} disabled={!hasNext} onClick={() => onPage(page + 1)}>
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

export function RelationshipStateBadge({ state }: { state: Relationship["state"] }) {
  const t = useTranslations("trdCommon.state");
  return state === "ACTIVE" ? <Badge variant="success">{t("ACTIVE")}</Badge> : <Badge variant="secondary">{t("DISCONNECTED")}</Badge>;
}

/** The counterparty's display name, loaded per row (no batch partner endpoint). */
export function PartnerName({ organizationId, className }: { organizationId: string; className?: string }) {
  const t = useTranslations("trdCommon");
  const partner = usePartner(organizationId);
  if (partner.isPending) return <Skeleton className="h-4 w-32" />;
  if (partner.isError) return <span className={className}>{isApiError(partner.error, "NOT_FOUND") ? t("formerPartner") : t("partnerUnavailable")}</span>;
  return <span className={className}>{partner.data.displayName}</span>;
}

/** Identity fields and the explicitly shared business contact (never member directories). */
export function PartnerDetailsCard({ partner }: { partner: Partner }) {
  const t = useTranslations("trdCommon.partner");
  const tc = useTranslations("common");
  const rows: [string, React.ReactNode][] = [
    [t("legalName"), partner.legalName],
    [t("registration"), <span key="r" className="font-mono">{partner.registrationIdentifier}</span>],
    [t("tax"), partner.taxIdentifier ? <span key="t" className="font-mono">{partner.taxIdentifier}</span> : tc("dash")],
  ];
  const contact = partner.businessContact;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        {partner.relationshipState === "DISCONNECTED" && <CardDescription>{t("frozen")}</CardDescription>}
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("contact")}</span>
          {contact ? (
            <>
              <span className="font-medium">{contact.name}</span>
              <a href={`tel:${contact.phone.replace(/[^+0-9]/g, "")}`} className="hover:underline">
                {contact.phone}
              </a>
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="break-all hover:underline">
                  {contact.email}
                </a>
              )}
            </>
          ) : (
            <span>{t("noContact", { name: partner.displayName })}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Owner/admin of either party. Needs the current relationship revision and a reason that the
 * partner can read. A stale revision is a 409 REVISION_CONFLICT: the reason typed so far is kept
 * and the relationship is refetched, so the user re-reads the state before trying again.
 */
export function DisconnectDialog({
  relationship,
  partnerName,
  onDisconnected,
}: {
  relationship: Relationship;
  partnerName: string;
  onDisconnected?: (relationship: Relationship) => void;
}) {
  const t = useTranslations("trdCommon.disconnect");
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const disconnect = useDisconnect();
  const trimmed = reason.trim();
  const reasonError = disconnect.error && isApiError(disconnect.error) && disconnect.error.fieldCode("reason") ? errorText(disconnect.error) : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) disconnect.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">
          <UnplugIcon data-icon="inline-start" />
          {t("action")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: partnerName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form
          id="disconnect-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!trimmed) return;
            disconnect.mutate(
              { relationshipId: relationship.id, expectedRevision: relationship.revision, reason: trimmed },
              {
                onSuccess: (updated) => {
                  toast.success(t("done", { name: partnerName }));
                  setOpen(false);
                  setReason("");
                  onDisconnected?.(updated);
                },
              },
            );
          }}
        >
          <FieldGroup>
            {disconnect.error && !reasonError && <ProblemAlert error={disconnect.error} />}
            <Field data-invalid={!!reasonError || undefined}>
              <FieldLabel htmlFor="disconnect-reason">{t("reason")}</FieldLabel>
              <Textarea
                id="disconnect-reason"
                required
                maxLength={1000}
                rows={3}
                value={reason}
                aria-invalid={!!reasonError || undefined}
                onChange={(e) => setReason(e.target.value)}
              />
              {reasonError ? <FieldError>{reasonError}</FieldError> : <FieldDescription>{t("reasonHint", { name: partnerName })}</FieldDescription>}
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("keep")}
          </Button>
          <Button type="submit" form="disconnect-form" variant="destructive" disabled={!trimmed || disconnect.isPending}>
            {disconnect.isPending && <Spinner data-icon="inline-start" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
