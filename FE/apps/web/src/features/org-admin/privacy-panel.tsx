"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DownloadIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";
import { canManageOrganization, downloadPortableExport, formatDateTime, isApiError, textProblem, uuidv7, type PrivacyCase } from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { useIdErrorText } from "@/features/auth/error-text";
import { FormError } from "@/features/auth/form-error";
import { useGuarded } from "@/features/auth/reauth";
import { useBusiness } from "@/lib/session";
import { useProblemText } from "./parts";
import { usePrivacyCases, usePrivacyExport, useRequestPrivacyCase } from "./queries";

/** Assisted privacy cases (owner/admin): intake, status and, for data copies, the JSON download. */
export function PrivacyPanel() {
  const t = useTranslations("settings.privacy");
  const { account } = useBusiness();
  const allowed = canManageOrganization(account.role);
  const cases = usePrivacyCases(allowed);
  const [requesting, setRequesting] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{allowed ? t("description") : t("staffNote")}</CardDescription>
        {allowed && (
          <CardAction>
            <Button onClick={() => setRequesting(true)}>
              <PlusIcon data-icon="inline-start" />
              {t("request")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      {allowed && (
        <CardContent>
          {cases.isError ? (
            <ErrorState error={cases.error} onRetry={() => void cases.refetch()} />
          ) : cases.isPending ? (
            <RowsSkeleton rows={2} />
          ) : cases.data.length === 0 ? (
            <EmptyState icon={ShieldCheckIcon} title={t("empty")} />
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {cases.data.map((c) => (
                <CaseRow key={c.id} privacyCase={c} />
              ))}
            </ul>
          )}
        </CardContent>
      )}
      <RequestDialog open={requesting} onOpenChange={setRequesting} />
    </Card>
  );
}

function CaseRow({ privacyCase }: { privacyCase: PrivacyCase }) {
  const t = useTranslations("settings.privacy");
  const guarded = useGuarded();
  const errorText = useIdErrorText();
  const exportable = privacyCase.kind === "EXPORT" && (privacyCase.state === "READY" || privacyCase.state === "COMPLETED");
  const file = usePrivacyExport(privacyCase.id, exportable);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!file.data) return;
    setDownloading(true);
    try {
      const response = await guarded(() => downloadPortableExport(file.data));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `narudzbine-export-${privacyCase.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("downloaded"));
    } catch (e) {
      if (!isApiError(e, "REAUTHENTICATION_REQUIRED")) toast.error(errorText(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {t(`kinds.${privacyCase.kind}`)}
          <Badge variant="outline">{t(`states.${privacyCase.state}`)}</Badge>
        </span>
        <span className="text-xs text-muted-foreground">{t("createdAt", { date: formatDateTime(privacyCase.createdAt) })}</span>
        {exportable && file.data && (
          <span className="text-xs text-muted-foreground">
            {t(`exportStates.${file.data.state}`)}
            {file.data.expiresAt && file.data.state === "READY" && ` · ${t("exportExpires", { date: formatDateTime(file.data.expiresAt) })}`}
          </span>
        )}
      </div>
      {exportable && file.data?.state === "READY" && (
        <Button variant="outline" size="sm" disabled={downloading} onClick={() => void download()}>
          {downloading ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
          {t("download")}
        </Button>
      )}
    </li>
  );
}

function RequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("settings.privacy");
  const tc = useTranslations("common");
  const problemText = useProblemText();
  const [id, setId] = useState(uuidv7);
  const [kind, setKind] = useState<"EXPORT" | "REDACTION">("EXPORT");
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const request = useRequestPrivacyCase();
  const problem = textProblem(reason, { max: 1000 });
  const close = () => {
    onOpenChange(false);
    setReason("");
    setAttempted(false);
    request.reset();
    // A new request intent gets a new id.
    setId(uuidv7());
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("requestTitle")}</DialogTitle>
        </DialogHeader>
        <form
          id="privacy-form"
          onSubmit={(e) => {
            e.preventDefault();
            setAttempted(true);
            if (problem) return;
            request.mutate(
              { id, kind, reason: reason.trim() },
              {
                onSuccess: () => {
                  toast.success(t("requested"));
                  close();
                },
              },
            );
          }}
        >
          <FieldGroup>
            <FormError error={request.error} />
            <Field>
              <FieldLabel htmlFor="privacy-kind">{t("kind")}</FieldLabel>
              <Select value={kind} onValueChange={(v) => setKind(v as "EXPORT" | "REDACTION")}>
                <SelectTrigger id="privacy-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="EXPORT">{t("kinds.EXPORT")}</SelectItem>
                    <SelectItem value="REDACTION">{t("kinds.REDACTION")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={(attempted && !!problem) || undefined}>
              <FieldLabel htmlFor="privacy-reason">{t("reason")}</FieldLabel>
              <Textarea id="privacy-reason" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
              {attempted && problem ? <FieldError>{problemText(problem)}</FieldError> : <FieldDescription>{t("reasonHint")}</FieldDescription>}
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="privacy-form" disabled={request.isPending}>
            {request.isPending && <Spinner data-icon="inline-start" />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
