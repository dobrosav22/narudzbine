"use client";

import { useState } from "react";
import { SearchIcon, TagIcon } from "lucide-react";
import { toast } from "sonner";
import {
  countMsg,
  currencySymbol,
  describeDiscount,
  describeScope,
  draftFromPromotion,
  emptyPromotionDraft,
  formatNumber,
  isServiceError,
  parseDecimal,
  promotionReach,
  PROMOTION_SCOPE_KEY,
  validatePromotionDraft,
  withScope,
  type Product,
  type Promotion,
  type PromotionDraft,
  type PromotionDraftField,
  type Msg,
} from "@repo/core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FormError } from "@/features/auth/form-error";
import { useSavePromotion } from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText, useMsg } from "@/lib/i18n";

export interface ScopeOption {
  id: string;
  name: string;
  hint?: string;
}

export interface ScopeOptions {
  category: ScopeOption[];
  product: ScopeOption[];
  buyer: ScopeOption[];
}

/**
 * Create/edit a promotion (01 §4: percentage or fixed, scoped to the whole catalogue,
 * categories, products or buyers, with a start/end date). `promotion` undefined = new.
 * The body is keyed by the promotion, so every open starts from fresh state.
 */
export function PromotionDialog({
  vendorOrgId,
  open,
  promotion,
  options,
  products,
  names,
  onClose,
}: {
  vendorOrgId: string;
  open: boolean;
  promotion: Promotion | undefined;
  options: ScopeOptions;
  products: Product[];
  names: ReadonlyMap<string, string>;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <PromotionForm
            key={promotion?.id ?? "new"}
            vendorOrgId={vendorOrgId}
            promotion={promotion}
            options={options}
            products={products}
            names={names}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PromotionForm({
  vendorOrgId,
  promotion,
  options,
  products,
  names,
  onClose,
}: {
  vendorOrgId: string;
  promotion: Promotion | undefined;
  options: ScopeOptions;
  products: Product[];
  names: ReadonlyMap<string, string>;
  onClose: () => void;
}) {
  const t = useTranslations("merch.dialog");
  const tc = useTranslations("common");
  const tm = useMsg();
  const errorText = useErrorText();
  const [draft, setDraft] = useState<PromotionDraft>(() => (promotion ? draftFromPromotion(promotion) : emptyPromotionDraft()));
  // Errors appear after the first save attempt, then track edits live.
  const [attempted, setAttempted] = useState(false);
  const save = useSavePromotion(vendorOrgId);
  const { input, errors } = validatePromotionDraft(draft);
  const shownMsg: Partial<Record<PromotionDraftField, Msg>> = attempted ? errors : {};
  const shown = Object.fromEntries(Object.entries(shownMsg).map(([k, m]) => [k, m && tm(m)])) as Partial<Record<PromotionDraftField, string>>;

  const set = <K extends keyof PromotionDraft>(key: K, value: PromotionDraft[K]) => {
    if (save.error) save.reset();
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const previewValue = parseDecimal(draft.value);
  const summary =
    previewValue && previewValue > 0
      ? t("summary", {
          discount: tm(describeDiscount({ type: draft.type, value: previewValue })),
          scope: tm(describeScope({ scope: draft.scope, scopeIds: draft.scopeIds }, names)),
          reach: tm(countMsg("promotions.scopeCount.product", promotionReach({ scope: draft.scope, scopeIds: draft.scopeIds }, products))),
        })
      : undefined;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{promotion ? t("editTitle") : t("newTitle")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <form
        id="promotion-form"
        className="-mx-1 max-h-[60vh] overflow-y-auto px-1"
        onSubmit={(e) => {
          e.preventDefault();
          setAttempted(true);
          if (!input) return;
          save.mutate(
            { promotionId: promotion?.id, fields: input },
            {
              onSuccess: () => {
                toast.success(promotion ? t("saved") : t("created"));
                onClose();
              },
            },
          );
        }}
      >
        <FieldGroup>
          {save.error && !isServiceError(save.error, "VALIDATION") && <FormError error={save.error} />}

          <Field>
            <FieldLabel id="promo-type-label">{t("discount")}</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby="promo-type-label"
              value={draft.type}
              onValueChange={(v) => v && set("type", v as PromotionDraft["type"])}
            >
              <ToggleGroupItem value="percentage">{t("percentage")}</ToggleGroupItem>
              <ToggleGroupItem value="fixed">{t("fixed")}</ToggleGroupItem>
            </ToggleGroup>
          </Field>

          <Field data-invalid={!!shown.value || undefined}>
            <FieldLabel htmlFor="promo-value">{draft.type === "percentage" ? t("percentOff") : t("amountOff")}</FieldLabel>
            <InputGroup className="max-w-40">
              <InputGroupInput
                id="promo-value"
                inputMode="decimal"
                className="font-mono"
                value={draft.value}
                aria-invalid={!!shown.value || undefined}
                onChange={(e) => set("value", e.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{draft.type === "percentage" ? "%" : currencySymbol()}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            {shown.value && <FieldError>{shown.value}</FieldError>}
            {/* The service's own VALIDATION message, when it disagrees with the client check. */}
            {isServiceError(save.error, "VALIDATION") && <FieldError>{errorText(save.error)}</FieldError>}
          </Field>

          <FieldSet>
            <FieldLegend variant="label">{t("appliesTo")}</FieldLegend>
            <RadioGroup
              value={draft.scope}
              onValueChange={(v) => {
                if (save.error) save.reset();
                setDraft((d) => withScope(d, v as PromotionDraft["scope"]));
              }}
              className="grid grid-cols-2 gap-2"
            >
              {(Object.keys(PROMOTION_SCOPE_KEY) as PromotionDraft["scope"][]).map((scope) => (
                <Field key={scope} orientation="horizontal">
                  <RadioGroupItem value={scope} id={`promo-scope-${scope}`} />
                  <FieldLabel htmlFor={`promo-scope-${scope}`} className="font-normal">
                    {tm({ key: PROMOTION_SCOPE_KEY[scope] })}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          </FieldSet>

          {draft.scope !== "all" && (
            <ScopePicker
              scope={draft.scope}
              options={options[draft.scope]}
              selected={draft.scopeIds}
              error={shown.scopeIds}
              onChange={(ids) => set("scopeIds", ids)}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={!!shown.startDay || undefined}>
              <FieldLabel htmlFor="promo-start">{t("starts")}</FieldLabel>
              <Input
                id="promo-start"
                type="date"
                value={draft.startDay}
                aria-invalid={!!shown.startDay || undefined}
                onChange={(e) => set("startDay", e.target.value)}
              />
              {shown.startDay && <FieldError>{shown.startDay}</FieldError>}
            </Field>
            <Field data-invalid={!!shown.endDay || undefined}>
              <FieldLabel htmlFor="promo-end">{t("ends")}</FieldLabel>
              <Input
                id="promo-end"
                type="date"
                value={draft.endDay}
                aria-invalid={!!shown.endDay || undefined}
                onChange={(e) => set("endDay", e.target.value)}
              />
              {shown.endDay && <FieldError>{shown.endDay}</FieldError>}
            </Field>
          </div>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="promo-active">{t("active")}</FieldLabel>
              <FieldDescription>{t("activeDescription")}</FieldDescription>
            </FieldContent>
            <Switch id="promo-active" checked={draft.isActive} onCheckedChange={(v) => set("isActive", v)} />
          </Field>

          {summary && (
            <Alert aria-live="polite">
              <TagIcon />
              <AlertDescription>{summary}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </form>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" form="promotion-form" disabled={save.isPending}>
          {save.isPending && <Spinner data-icon="inline-start" />}
          {promotion ? t("save") : t("create")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Checkbox list of the scope's ids; a search box appears once the list is long. */
function ScopePicker({
  scope,
  options,
  selected,
  error,
  onChange,
}: {
  scope: Exclude<PromotionDraft["scope"], "all">;
  options: ScopeOption[];
  selected: string[];
  error?: string;
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations(`merch.picker.${scope}`);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((o) => `${o.name} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options;

  return (
    <FieldSet data-invalid={!!error || undefined}>
      <FieldLegend variant="label">
        {t("legend", { count: formatNumber(selected.length) })}
      </FieldLegend>
      {options.length > 8 && (
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
        </InputGroup>
      )}
      {options.length === 0 ? (
        <FieldDescription>{t("none")}</FieldDescription>
      ) : (
        <div role="group" aria-label={t("pick")} className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-lg border p-3">
          {visible.map((o) => (
            <Field key={o.id} orientation="horizontal">
              <Checkbox
                id={`promo-pick-${o.id}`}
                checked={selected.includes(o.id)}
                onCheckedChange={(v) => onChange(v === true ? [...selected, o.id] : selected.filter((x) => x !== o.id))}
              />
              <FieldLabel htmlFor={`promo-pick-${o.id}`} className="font-normal">
                {o.name}
                {o.hint && <span className="font-mono text-xs text-muted-foreground">{o.hint}</span>}
              </FieldLabel>
            </Field>
          ))}
          {visible.length === 0 && <p className="text-sm text-muted-foreground">{t("noMatch", { query })}</p>}
        </div>
      )}
      {error && <FieldError>{error}</FieldError>}
    </FieldSet>
  );
}
