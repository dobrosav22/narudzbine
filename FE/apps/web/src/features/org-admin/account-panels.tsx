"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  isServiceError,
  NOTIFICATION_CHANNELS,
  notificationRows,
  passwordProblems,
  type Membership,
  type PasswordDraft,
  type Msg,
} from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormError } from "@/features/auth/form-error";
import { useVendorOrg } from "@/features/vendor-catalogue/queries";
import {
  useChangePassword,
  useLocations,
  useNotificationPrefs,
  useSetHomeLocation,
  useTogglePreference,
  useUpdateProfile,
} from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText, useMsg } from "@/lib/i18n";
import { LanguageSelect } from "@/components/language-select";

const NONE = "none";

/**
 * 01 §10 "Account profile" [assumed shape]: your name (the same on every organization this
 * login belongs to), your email (read-only — it's the login), your home location in the
 * current organization, and a password change.
 */
export function ProfilePanel({ membership, email }: { membership: Membership; email: string }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Not keyed by the name: a remount on save would drop mutate()'s onSuccess (no toast). */}
      <DetailsCard membership={membership} email={email} />
      <LanguageCard />
      <PasswordCard email={email} />
    </div>
  );
}

function DetailsCard({ membership, email }: { membership: Membership; email: string }) {
  const t = useTranslations("account.profile");
  const errorText = useErrorText();
  const [name, setName] = useState(membership.user.name);
  const update = useUpdateProfile(email);
  const locations = useLocations({ orgType: membership.orgType, orgId: membership.org.id });
  const home = useSetHomeLocation(membership);
  const nameError = isServiceError(update.error, "VALIDATION") ? errorText(update.error) : !name.trim() ? t("nameRequired") : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            update.mutate(name, { onSuccess: () => toast.success(t("saved")) });
          }}
        >
          <FieldGroup className="max-w-md">
            {update.error && !isServiceError(update.error, "VALIDATION") && <FormError error={update.error} />}
            <Field data-invalid={!!nameError || undefined}>
              <FieldLabel htmlFor="profile-name">{t("name")}</FieldLabel>
              <Input
                id="profile-name"
                autoComplete="name"
                value={name}
                aria-invalid={!!nameError || undefined}
                onChange={(e) => {
                  if (update.error) update.reset();
                  setName(e.target.value);
                }}
              />
              {nameError ? <FieldError>{nameError}</FieldError> : <FieldDescription>{t("nameHint")}</FieldDescription>}
            </Field>
            <Field data-disabled>
              <FieldLabel htmlFor="profile-email">{t("email")}</FieldLabel>
              <Input id="profile-email" value={email} disabled readOnly />
              <FieldDescription>{t("emailHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-home">{t("home", { org: membership.org.name })}</FieldLabel>
              <Select
                value={membership.user.homeLocationId ?? NONE}
                disabled={!locations.data || home.isPending}
                onValueChange={(v) =>
                  home.mutate(v === NONE ? null : v, {
                    onSuccess: () => toast.success(t("homeSaved")),
                    onError: (e) => toast.error(errorText(e)),
                  })
                }
              >
                <SelectTrigger id="profile-home" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NONE}>{t("noHome")}</SelectItem>
                    {locations.data?.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {membership.orgType === "buyer" ? t("homeBuyerHint") : t("homeVendorHint")}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="submit" form="profile-form" disabled={name.trim() === membership.user.name || !name.trim() || update.isPending}>
          {update.isPending && <Spinner data-icon="inline-start" />}
          {t("save")}
        </Button>
      </CardFooter>
    </Card>
  );
}

const EMPTY_PASSWORDS: PasswordDraft = { current: "", next: "", confirm: "" };

/** 01 §12: per-user interface language, saved on the login; text labels only, no flags. */
function LanguageCard() {
  const t = useTranslations("account.language");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LanguageSelect className="w-full max-w-md" />
      </CardContent>
    </Card>
  );
}

function PasswordCard({ email }: { email: string }) {
  const t = useTranslations("account.password");
  const tm = useMsg();
  const errorText = useErrorText();
  const [draft, setDraft] = useState(EMPTY_PASSWORDS);
  const [attempted, setAttempted] = useState(false);
  const change = useChangePassword(email);
  const problems = passwordProblems(draft);
  const shownMsg: Partial<Record<keyof PasswordDraft, Msg>> = attempted ? problems : {};
  const shown = { current: shownMsg.current && tm(shownMsg.current), next: shownMsg.next && tm(shownMsg.next), confirm: shownMsg.confirm && tm(shownMsg.confirm) };
  // A wrong current password is the service's call; it belongs on that field.
  const currentError = shown.current ?? (isServiceError(change.error, "UNAUTHORIZED") ? errorText(change.error) : undefined);
  const set = (key: keyof PasswordDraft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (change.error) change.reset();
    setDraft((d) => ({ ...d, [key]: e.target.value }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          id="password-form"
          onSubmit={(e) => {
            e.preventDefault();
            setAttempted(true);
            if (Object.keys(problems).length) return;
            change.mutate(
              { currentPassword: draft.current, newPassword: draft.next },
              {
                onSuccess: () => {
                  toast.success(t("changed"));
                  setDraft(EMPTY_PASSWORDS);
                  setAttempted(false);
                },
              },
            );
          }}
        >
          <FieldGroup className="max-w-md">
            {change.error && !isServiceError(change.error, "UNAUTHORIZED") && <FormError error={change.error} />}
            <Field data-invalid={!!currentError || undefined}>
              <FieldLabel htmlFor="password-current">{t("current")}</FieldLabel>
              <Input id="password-current" type="password" autoComplete="current-password" value={draft.current} onChange={set("current")} aria-invalid={!!currentError || undefined} />
              {currentError && <FieldError>{currentError}</FieldError>}
            </Field>
            <Field data-invalid={!!shown.next || undefined}>
              <FieldLabel htmlFor="password-new">{t("new")}</FieldLabel>
              <Input id="password-new" type="password" autoComplete="new-password" value={draft.next} onChange={set("next")} aria-invalid={!!shown.next || undefined} />
              {shown.next && <FieldError>{shown.next}</FieldError>}
            </Field>
            <Field data-invalid={!!shown.confirm || undefined}>
              <FieldLabel htmlFor="password-confirm">{t("confirm")}</FieldLabel>
              <Input id="password-confirm" type="password" autoComplete="new-password" value={draft.confirm} onChange={set("confirm")} aria-invalid={!!shown.confirm || undefined} />
              {shown.confirm && <FieldError>{shown.confirm}</FieldError>}
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="submit" form="password-form" disabled={!draft.current || change.isPending}>
          {change.isPending && <Spinner data-icon="inline-start" />}
          {t("submit")}
        </Button>
      </CardFooter>
    </Card>
  );
}

/** 03 → "Notification settings": the type × channel matrix (01 §8). Each switch saves on its own. */
export function NotificationsPanel({ membership }: { membership: Membership }) {
  return membership.orgType === "vendor" ? <VendorNotifications membership={membership} /> : <NotificationMatrix membership={membership} />;
}

/** Low-stock alerts depend on the vendor tracking inventory, so vendors read their org first. */
function VendorNotifications({ membership }: { membership: Membership }) {
  const vendor = useVendorOrg(membership.org.id);
  return <NotificationMatrix membership={membership} tracksInventory={vendor.data?.tracksInventory} />;
}

function NotificationMatrix({ membership, tracksInventory }: { membership: Membership; tracksInventory?: boolean }) {
  const t = useTranslations("account.notifications");
  const tm = useMsg();
  const prefs = useNotificationPrefs(membership);
  const toggle = useTogglePreference(membership);

  if (prefs.isError) return <ErrorState error={prefs.error} onRetry={() => void prefs.refetch()} />;
  if (prefs.isPending) return <RowsSkeleton rows={4} />;
  const rows = notificationRows(prefs.data, membership.orgType, { tracksInventory });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table className="text-sm" aria-label={t("tableAria")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("event")}</TableHead>
              {NOTIFICATION_CHANNELS.map((c) => (
                <TableHead key={c.value} className="w-20 text-center">
                  {tm({ key: c.labelKey })}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.type}>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{tm({ key: r.labelKey })}</span>
                    <span className="text-muted-foreground">{tm({ key: r.unavailableKey ?? r.descriptionKey })}</span>
                  </div>
                </TableCell>
                {NOTIFICATION_CHANNELS.map((c) => (
                  <TableCell key={c.value} className="text-center">
                    <Switch
                      aria-label={t("switchAria", { label: tm({ key: r.labelKey }), channel: tm({ key: `channelsBy.${c.value}` }) })}
                      checked={r.enabled[c.value] && !r.unavailableKey}
                      disabled={!!r.unavailableKey}
                      onCheckedChange={(enabled) =>
                        toggle.mutate(
                          { notificationType: r.type, channel: c.value, enabled },
                          { onError: () => toast.error(t("saveFailed")) },
                        )
                      }
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
