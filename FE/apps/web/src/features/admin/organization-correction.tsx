"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  correctionUnchanged,
  fieldProblemMsg,
  isApiError,
  isFilledWithin,
  organizationCorrectionBody,
  organizationCorrectionForm,
  type Organization,
  type OrganizationCorrectionForm,
} from "@repo/core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useGuarded } from "@/features/auth/reauth";
import { useMsg } from "@/lib/i18n";
import { MutationError, REASON_MAX, ReasonField } from "./parts";
import { useAdminOrganization, useCorrectOrganization } from "./queries";

/**
 * Typo correction of administrative identity (adminCorrectOrganization): a complete replacement
 * with a required reason asserting the correction is proven. Country, type, currency, owner,
 * language and business settings are not editable here.
 */
export function CorrectOrganizationDialog({ org, open, onOpenChange }: { org: Organization; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">{open && <CorrectionForm org={org} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

type TextField = Exclude<keyof OrganizationCorrectionForm, "reason">;
const FIELDS: { key: TextField; path: string; max: number; optional?: boolean; mono?: boolean }[] = [
  { key: "displayName", path: "displayName", max: 200 },
  { key: "legalName", path: "legalName", max: 200 },
  { key: "registrationIdentifier", path: "registrationIdentifier", max: 64, mono: true },
  { key: "taxIdentifier", path: "taxIdentifier", max: 64, optional: true, mono: true },
  { key: "line1", path: "registeredAddress/line1", max: 200 },
  { key: "line2", path: "registeredAddress/line2", max: 200, optional: true },
  { key: "postalCode", path: "registeredAddress/postalCode", max: 20 },
  { key: "city", path: "registeredAddress/city", max: 100 },
];

function CorrectionForm({ org, onClose }: { org: Organization; onClose: () => void }) {
  const t = useTranslations("admin.correction");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const tm = useMsg();
  const guarded = useGuarded();
  const correct = useCorrectOrganization();
  const detail = useAdminOrganization(org.id);
  const [form, setForm] = useState<OrganizationCorrectionForm>(() => organizationCorrectionForm(org));

  const set = (key: keyof OrganizationCorrectionForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const requiredFilled = FIELDS.every((f) => f.optional || form[f.key].trim() !== "");
  const unchanged = correctionUnchanged(org, form);
  const valid = requiredFilled && !unchanged && isFilledWithin(form.reason, REASON_MAX);
  const error = correct.error;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || correct.isPending) return;
    try {
      await guarded(() => correct.mutateAsync({ organizationId: org.id, body: organizationCorrectionBody(org, form, org.revision) }));
      toast.success(t("saved"));
      onClose();
    } catch (err) {
      // Keep the operator's input; reload the record so they can compare and save again.
      if (isApiError(err, "REVISION_CONFLICT")) void detail.refetch();
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{t("title", { name: org.displayName })}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => {
            const code = isApiError(error) ? error.fieldCode(f.path) : undefined;
            const message = fieldProblemMsg(code);
            return (
              <Field key={f.key} className={f.key === "line1" || f.key === "line2" ? "sm:col-span-2" : undefined}>
                <FieldLabel htmlFor={`correct-${f.key}`}>
                  {t(`field.${f.key}`)}
                  {f.optional && <span className="font-normal text-muted-foreground"> ({tc("optional")})</span>}
                </FieldLabel>
                <Input
                  id={`correct-${f.key}`}
                  value={form[f.key]}
                  maxLength={f.max}
                  onChange={(e) => set(f.key)(e.target.value)}
                  className={f.mono ? "font-mono" : undefined}
                  aria-invalid={Boolean(code)}
                  required={!f.optional}
                />
                {message && <FieldDescription className="text-destructive">{tm(message)}</FieldDescription>}
              </Field>
            );
          })}
        </div>
        <FieldDescription>{t("fixedFields")}</FieldDescription>
        <ReasonField id="correct-reason" label={t("reason")} hint={t("reasonHint")} value={form.reason} onChange={set("reason")} />
      </FieldGroup>
      {unchanged && <p className="text-sm text-muted-foreground">{t("unchanged")}</p>}
      {isApiError(error, "REVISION_CONFLICT") && (
        <Alert>
          <AlertDescription>{t("conflict")}</AlertDescription>
        </Alert>
      )}
      {!isApiError(error, "REVISION_CONFLICT") && (
        <MutationError error={error} messages={{ ORGANIZATION_IDENTIFIER_IN_USE: t("identifierInUse"), COUNTRY_IMMUTABLE: t("countryImmutable") }} />
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" disabled={!valid || correct.isPending}>
          {correct.isPending && <Spinner data-icon="inline-start" />}
          {ta("detail.correct")}
        </Button>
      </DialogFooter>
    </form>
  );
}
