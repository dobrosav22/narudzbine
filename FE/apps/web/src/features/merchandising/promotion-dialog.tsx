"use client";

import { useDeferredValue, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  COUNTRY_TIME_ZONE,
  currencySymbol,
  emptyPromotionDraft,
  promotionActions,
  promotionToDraft,
  uuidv7,
  validatePromotionDraft,
  type Msg,
  type Promotion,
  type PromotionDraft,
  type PromotionDraftErrors,
} from "@repo/core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMsg } from "@/lib/i18n";
import { useBusiness } from "@/lib/session";
import { CatalogueFormError } from "@/features/vendor-catalogue/parts";
import { useCatalogueBuyers, useProducts, useTaxonomy } from "@/features/vendor-catalogue/queries";
import { usePromotionMutations } from "./queries";

/** Create, edit (before start) or view a promotion. `promotion` undefined = new. */
export function PromotionDialog({ promotion, onClose }: { promotion: Promotion | undefined; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <PromotionForm promotion={promotion} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function PromotionForm({ promotion, onClose }: { promotion: Promotion | undefined; onClose: () => void }) {
  const t = useTranslations("merch.dialog");
  const tc = useTranslations("common");
  const tm = useMsg();
  const { organization } = useBusiness();
  const country = organization.country;
  const readOnly = !!promotion && !promotionActions(promotion).edit;
  const [draft, setDraft] = useState<PromotionDraft>(() => (promotion ? promotionToDraft(promotion, country) : emptyPromotionDraft(country)));
  const [errors, setErrors] = useState<PromotionDraftErrors>({});
  const [createId] = useState(() => uuidv7());
  const [labels, setLabels] = useState(() => new Map(promotion?.targetLabels.products.map((p) => [p.id, p.name])));
  const m = usePromotionMutations();
  const save = promotion ? m.update : m.create;
  const err = (x: Msg | undefined) => (x ? tm(x) : undefined);

  const set = <K extends keyof PromotionDraft>(key: K, value: PromotionDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors({});
    save.reset();
  };

  const submit = () => {
    const result = validatePromotionDraft(draft, country);
    if (!result.ok) return setErrors(result.errors);
    const options = {
      onSuccess: () => {
        toast.success(promotion ? t("saved") : t("created"));
        onClose();
      },
    };
    if (promotion) m.update.mutate({ id: promotion.id, body: { expectedRevision: promotion.revision, ...result.value } }, options);
    else m.create.mutate({ id: createId, ...result.value }, options);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{readOnly ? t("viewTitle") : promotion ? t("editTitle") : t("newTitle")}</DialogTitle>
        <DialogDescription>{readOnly ? t("frozen") : t("description")}</DialogDescription>
      </DialogHeader>
      <form
        id="promotion-form"
        className="-mx-1 max-h-[65vh] overflow-y-auto px-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!readOnly) submit();
        }}
      >
        <fieldset disabled={readOnly} className="contents">
          <FieldGroup>
            <CatalogueFormError error={save.error} />
            <Field data-invalid={!!errors.name || undefined}>
              <FieldLabel htmlFor="promo-name">{t("name")}</FieldLabel>
              <Input id="promo-name" value={draft.name} maxLength={200} onChange={(e) => set("name", e.target.value)} />
              <FieldError>{err(errors.name)}</FieldError>
            </Field>
            <Field>
              <FieldLabel id="promo-kind">{t("kind")}</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby="promo-kind"
                value={draft.kind}
                disabled={readOnly}
                onValueChange={(v) => v && set("kind", v as PromotionDraft["kind"])}
              >
                <ToggleGroupItem value="PERCENTAGE">{t("percentage")}</ToggleGroupItem>
                <ToggleGroupItem value="FIXED_UNIT_PRICE">{t("fixed")}</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field data-invalid={!!errors.value || undefined}>
              <FieldLabel htmlFor="promo-value">{draft.kind === "PERCENTAGE" ? t("percentLabel") : t("fixedLabel")}</FieldLabel>
              <InputGroup className="max-w-44">
                <InputGroupInput id="promo-value" inputMode="decimal" className="font-mono" value={draft.value} onChange={(e) => set("value", e.target.value)} />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{draft.kind === "PERCENTAGE" ? "%" : currencySymbol(organization.currency)}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              {errors.value ? <FieldError>{err(errors.value)}</FieldError> : draft.kind === "FIXED_UNIT_PRICE" && <FieldDescription>{t("fixedHint")}</FieldDescription>}
            </Field>

            <FieldSet data-invalid={!!errors.products || undefined}>
              <FieldLegend variant="label">{t("products")}</FieldLegend>
              <RadioGroup value={draft.productMode} disabled={readOnly} onValueChange={(v) => set("productMode", v as PromotionDraft["productMode"])} className="flex flex-col gap-2">
                <Field orientation="horizontal">
                  <RadioGroupItem value="ALL" id="promo-products-all" />
                  <FieldLabel htmlFor="promo-products-all" className="font-normal">
                    {t("allProducts")}
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem value="SELECTED" id="promo-products-selected" />
                  <FieldLabel htmlFor="promo-products-selected" className="font-normal">
                    {t("selectedProducts")}
                  </FieldLabel>
                </Field>
              </RadioGroup>
              {draft.productMode === "SELECTED" && (
                <>
                  <ProductPicker
                    readOnly={readOnly}
                    selected={draft.productIds}
                    labels={labels}
                    onPick={(id, name) => {
                      setLabels((l) => new Map(l).set(id, name));
                      set("productIds", draft.productIds.includes(id) ? draft.productIds : [...draft.productIds, id]);
                    }}
                    onRemove={(id) => set("productIds", draft.productIds.filter((x) => x !== id))}
                  />
                  <CategoryPicker readOnly={readOnly} selected={draft.categoryIds} fallback={promotion?.targetLabels.categories} onChange={(ids) => set("categoryIds", ids)} />
                </>
              )}
              <FieldError>{err(errors.products)}</FieldError>
            </FieldSet>

            <FieldSet data-invalid={!!errors.buyers || undefined}>
              <FieldLegend variant="label">{t("buyers")}</FieldLegend>
              <RadioGroup value={draft.buyerMode} disabled={readOnly} onValueChange={(v) => set("buyerMode", v as PromotionDraft["buyerMode"])} className="flex flex-col gap-2">
                <Field orientation="horizontal">
                  <RadioGroupItem value="ALL" id="promo-buyers-all" />
                  <FieldLabel htmlFor="promo-buyers-all" className="font-normal">
                    {t("allBuyers")}
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem value="SELECTED" id="promo-buyers-selected" />
                  <FieldLabel htmlFor="promo-buyers-selected" className="font-normal">
                    {t("selectedBuyers")}
                  </FieldLabel>
                </Field>
              </RadioGroup>
              {draft.buyerMode === "SELECTED" && (
                <BuyerPicker readOnly={readOnly} selected={draft.buyerIds} fallback={promotion?.targetLabels.buyers} onChange={(ids) => set("buyerIds", ids)} />
              )}
              <FieldError>{err(errors.buyers)}</FieldError>
            </FieldSet>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={!!errors.startsAt || undefined}>
                <FieldLabel htmlFor="promo-start">{t("starts")}</FieldLabel>
                <Input id="promo-start" type="datetime-local" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
                <FieldError>{err(errors.startsAt)}</FieldError>
              </Field>
              <Field data-invalid={!!errors.endsAt || undefined}>
                <FieldLabel htmlFor="promo-end">{t("ends")}</FieldLabel>
                <Input id="promo-end" type="datetime-local" value={draft.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
                <FieldError>{err(errors.endsAt)}</FieldError>
              </Field>
            </div>
            <FieldDescription>{t("zoneNote", { zone: COUNTRY_TIME_ZONE[country] })}</FieldDescription>
          </FieldGroup>
        </fieldset>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {readOnly ? tc("close") : tc("cancel")}
        </Button>
        {!readOnly && (
          <Button type="submit" form="promotion-form" disabled={save.isPending}>
            {save.isPending && <Spinner data-icon="inline-start" />}
            {promotion ? t("save") : t("create")}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function ProductPicker({
  readOnly,
  selected,
  labels,
  onPick,
  onRemove,
}: {
  readOnly: boolean;
  selected: string[];
  labels: ReadonlyMap<string, string>;
  onPick: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("merch.dialog");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const results = useProducts({ page: 0, size: 8, ...(q ? { q } : {}) });
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <span className="text-sm font-medium">{t("productsPicked", { count: selected.length })}</span>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((id) => (
            <Badge key={id} variant="secondary">
              {labels.get(id) ?? t("unknownTarget")}
              {!readOnly && (
                <button type="button" aria-label={labels.get(id) ?? t("unknownTarget")} onClick={() => onRemove(id)}>
                  <XIcon className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      {!readOnly && (
        <>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchProducts")} aria-label={t("searchProducts")} />
          </InputGroup>
          <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
            {results.data?.items.length === 0 && <p className="text-sm text-muted-foreground">{t("noProducts")}</p>}
            {results.data?.items.map((p) => (
              <Field key={p.id} orientation="horizontal">
                <Checkbox
                  id={`promo-p-${p.id}`}
                  checked={selected.includes(p.id)}
                  onCheckedChange={(on) => (on === true ? onPick(p.id, p.name) : onRemove(p.id))}
                />
                <FieldLabel htmlFor={`promo-p-${p.id}`} className="font-normal">
                  {p.name}
                  <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                </FieldLabel>
              </Field>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CategoryPicker({
  readOnly,
  selected,
  fallback,
  onChange,
}: {
  readOnly: boolean;
  selected: string[];
  fallback: { id: string; name: string }[] | undefined;
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("merch.dialog");
  const categories = useTaxonomy("categories");
  const options = [...(categories.data ?? [])];
  // Frozen labels keep deleted categories visible on existing promotions.
  for (const f of fallback ?? []) if (!options.some((o) => o.id === f.id)) options.push({ id: f.id, name: f.name, revision: "" });
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <span className="text-sm font-medium">
        {t("categories")} · {t("categoriesPicked", { count: selected.length })}
      </span>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noCategories")}</p>
      ) : (
        <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
          {options.map((c) => (
            <Field key={c.id} orientation="horizontal">
              <Checkbox
                id={`promo-c-${c.id}`}
                disabled={readOnly}
                checked={selected.includes(c.id)}
                onCheckedChange={(on) => onChange(on === true ? [...selected, c.id] : selected.filter((x) => x !== c.id))}
              />
              <FieldLabel htmlFor={`promo-c-${c.id}`} className="font-normal">
                {c.name}
              </FieldLabel>
            </Field>
          ))}
        </div>
      )}
    </div>
  );
}

function BuyerPicker({
  readOnly,
  selected,
  fallback,
  onChange,
}: {
  readOnly: boolean;
  selected: string[];
  fallback: { id: string; name: string }[] | undefined;
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("merch.dialog");
  const buyers = useCatalogueBuyers();
  const options = (buyers.data ?? []).map((b) => ({ id: b.relationship.buyerId, name: b.partner?.displayName ?? t("unknownTarget") }));
  for (const f of fallback ?? []) if (!options.some((o) => o.id === f.id)) options.push(f);
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <span className="text-sm font-medium">{t("buyersPicked", { count: selected.length })}</span>
      {options.length === 0 ? (
        <Alert>
          <AlertDescription>{t("noBuyers")}</AlertDescription>
        </Alert>
      ) : (
        <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
          {options.map((b) => (
            <Field key={b.id} orientation="horizontal">
              <Checkbox
                id={`promo-b-${b.id}`}
                disabled={readOnly}
                checked={selected.includes(b.id)}
                onCheckedChange={(on) => onChange(on === true ? [...selected, b.id] : selected.filter((x) => x !== b.id))}
              />
              <FieldLabel htmlFor={`promo-b-${b.id}`} className="font-normal">
                {b.name}
              </FieldLabel>
            </Field>
          ))}
        </div>
      )}
    </div>
  );
}
