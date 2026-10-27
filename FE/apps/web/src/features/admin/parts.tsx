"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircleIcon, ArrowLeftIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatNumber, isApiError, isFilledWithin, type Country, type Organization } from "@repo/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useErrorText } from "@/lib/i18n";

export const REASON_MAX = 1000;

export function PageHeader({
  title,
  description,
  backHref,
  backLabel,
  actions,
  badges,
}: {
  title: string;
  description?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  badges?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      {backHref && (
        <Button asChild variant="ghost" size="icon" aria-label={backLabel}>
          <Link href={backHref}>
            <ArrowLeftIcon />
          </Link>
        </Button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight break-words">
          {title}
          {badges}
        </h1>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({ label, value, footer, href }: { label: string; value: number; footer?: string; href?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-xl tabular-nums">{formatNumber(value)}</CardTitle>
      </CardHeader>
      {footer && (
        <CardFooter className="text-sm text-muted-foreground">
          {href ? (
            <Link href={href} className="hover:text-foreground hover:underline">
              {footer}
            </Link>
          ) : (
            footer
          )}
        </CardFooter>
      )}
    </Card>
  );
}

const STATE_BADGE: Record<Organization["state"], "success" | "warning" | "secondary"> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  CLOSED: "secondary",
};

export function OrgStateBadge({ state }: { state: Organization["state"] }) {
  const t = useTranslations("admin.orgState");
  return <Badge variant={STATE_BADGE[state]}>{t(state)}</Badge>;
}

export function OrgTypeBadge({ type }: { type: Organization["type"] }) {
  const t = useTranslations("admin.orgType");
  return <Badge variant={type === "VENDOR" ? "brand" : "info"}>{t(type)}</Badge>;
}

export function CountryText({ country }: { country: Country }) {
  const t = useTranslations("admin.country");
  return <>{t(country)}</>;
}

/** A resource id in monospace with a copy button (operators paste ids between screens). */
export function IdText({ id, className }: { id: string; className?: string }) {
  const t = useTranslations("admin");
  const [copied, setCopied] = useState(false);
  return (
    <span className={`inline-flex max-w-full items-center gap-1 ${className ?? ""}`}>
      <code className="truncate font-mono text-xs text-muted-foreground">{id}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("copyId")}
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard?.writeText(id).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => undefined,
          );
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </span>
  );
}

/** Offset pagination. Without a total, "next" is offered while pages come back full. */
export function Pager({
  page,
  size,
  total,
  count,
  onPage,
}: {
  page: number;
  size: number;
  total: number | null | undefined;
  count: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("admin");
  const hasNext = total != null ? (page + 1) * size < total : count === size;
  if (page === 0 && !hasNext) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-2 text-sm text-muted-foreground">
      <span>{total != null ? t("pageOf", { page: formatNumber(page + 1), pages: formatNumber(Math.max(1, Math.ceil(total / size))) }) : t("page", { page: formatNumber(page + 1) })}</span>
      <Button variant="outline" size="icon-sm" aria-label={t("previousPage")} disabled={page === 0} onClick={() => onPage(page - 1)}>
        <ChevronLeftIcon />
      </Button>
      <Button variant="outline" size="icon-sm" aria-label={t("nextPage")} disabled={!hasNext} onClick={() => onPage(page + 1)}>
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

/** A filter dropdown with an explicit "All" choice (value ""). */
export function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  allLabel,
  className,
}: {
  label: string;
  value: T | "";
  onChange: (value: T | "") => void;
  options: { value: T; label: string }[];
  allLabel?: string;
  className?: string;
}) {
  const t = useTranslations("admin");
  return (
    <Select value={value || "__all"} onValueChange={(v) => onChange(v === "__all" ? "" : (v as T))}>
      <SelectTrigger className={className ?? "w-40"} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="__all">{allLabel ?? t("allOf", { label })}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** Inline failure for a form or dialog; stale revisions get an explicit "reload and re-apply" text. */
export function MutationError({ error, messages }: { error: unknown; messages?: Partial<Record<string, string>> }) {
  const t = useTranslations("admin");
  const errorText = useErrorText();
  if (!error) return null;
  const special = isApiError(error) ? messages?.[error.code] : undefined;
  const text = special ?? (isApiError(error, "REVISION_CONFLICT") ? t("revisionConflict") : errorText(error));
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircleIcon />
      <AlertTitle>{t("actionFailed")}</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

export function ReasonField({
  id,
  label,
  hint,
  value,
  onChange,
  max = REASON_MAX,
  rows = 3,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  rows?: number;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} maxLength={max} required />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

/**
 * Every administrative write carries a required reason. This dialog collects it, keeps the
 * input when the call fails, and closes only on success. `confirmText` adds a typed
 * confirmation for irreversible actions.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  reasonLabel,
  reasonHint,
  confirmLabel,
  destructive,
  confirmText,
  pending,
  error,
  errorMessages,
  children,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  reasonLabel?: string;
  reasonHint?: string;
  confirmLabel: string;
  destructive?: boolean;
  /** When set, the operator must type this exact text to enable the action. */
  confirmText?: string;
  pending: boolean;
  error: unknown;
  errorMessages?: Partial<Record<string, string>>;
  children?: React.ReactNode;
  onConfirm: (reason: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <ReasonForm
            title={title}
            description={description}
            reasonLabel={reasonLabel}
            reasonHint={reasonHint}
            confirmLabel={confirmLabel}
            destructive={destructive}
            confirmText={confirmText}
            pending={pending}
            error={error}
            errorMessages={errorMessages}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          >
            {children}
          </ReasonForm>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReasonForm({
  title,
  description,
  reasonLabel,
  reasonHint,
  confirmLabel,
  destructive,
  confirmText,
  pending,
  error,
  errorMessages,
  children,
  onCancel,
  onConfirm,
}: {
  title: string;
  description?: React.ReactNode;
  reasonLabel?: string;
  reasonHint?: string;
  confirmLabel: string;
  destructive?: boolean;
  confirmText?: string;
  pending: boolean;
  error: unknown;
  errorMessages?: Partial<Record<string, string>>;
  children?: React.ReactNode;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const confirmed = !confirmText || typed.trim() === confirmText.trim();
  const valid = isFilledWithin(reason, REASON_MAX) && confirmed;
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !pending) onConfirm(reason.trim());
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <FieldGroup>
        {children}
        <ReasonField id="admin-reason" label={reasonLabel ?? t("reason")} hint={reasonHint ?? t("reasonPrivateHint")} value={reason} onChange={setReason} />
        {confirmText && (
          <Field>
            <FieldLabel htmlFor="admin-confirm-text">{t("typeToConfirm", { text: confirmText })}</FieldLabel>
            <Input id="admin-confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        )}
      </FieldGroup>
      <MutationError error={error} messages={errorMessages} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {tc("cancel")}
        </Button>
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={!valid || pending}>
          {pending && <Spinner data-icon="inline-start" />}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Label/value rows for detail cards. */
export function DetailList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(10rem,auto)_1fr]">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
