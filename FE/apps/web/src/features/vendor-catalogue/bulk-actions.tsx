"use client";

import { useState } from "react";
import { ChevronDownIcon, TagIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  BULK_MAX_TARGETS,
  bulkPercentResult,
  currencySymbol,
  formatMoney,
  formatNumber,
  parsePercentChangeInput,
  parsePriceInput,
  type BulkChange,
  type BulkPrice,
  type NamedResource,
  type Pricing,
  type Product,
} from "@repo/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CatalogueFormError, useCatalogueErrorText } from "./parts";
import { useBulkEdit } from "./queries";

type Action = Omit<BulkChange, "targets">;

/**
 * Atomic bulk edit of the selected page rows (1..100): every target carries its current product
 * and pricing revisions; all products change together or none do. After a change the old
 * revisions are stale, so the selection is cleared and lists refetch.
 */
export function BulkActionsBar({
  selected,
  pricing,
  categories,
  tags,
  onDone,
}: {
  selected: Product[];
  pricing: ReadonlyMap<string, Pricing>;
  categories: NamedResource[];
  tags: NamedResource[];
  onDone: () => void;
}) {
  const t = useTranslations("vendorCatalogue.bulk");
  const errorText = useCatalogueErrorText();
  const bulk = useBulkEdit();
  const [priceOpen, setPriceOpen] = useState(false);
  const count = selected.length;
  const n = { count, countText: formatNumber(count) };
  const ready = selected.every((p) => pricing.has(p.id));

  const run = (action: Action, after?: () => void) => {
    const targets = selected.slice(0, BULK_MAX_TARGETS).map((p) => ({
      productId: p.id,
      expectedRevision: p.revision,
      expectedPricingRevision: pricing.get(p.id)!.revision,
    }));
    bulk.mutate(
      { targets, ...action },
      {
        onSuccess: () => {
          toast.success(t("done", n));
          after?.();
          onDone();
        },
        onError: (e) => {
          if (!priceOpen) toast.error(errorText(e));
        },
      },
    );
  };

  return (
    <div role="toolbar" aria-label={t("aria")} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-2">
      <span className="px-1 text-sm font-medium">{t("selected", n)}</span>
      {(bulk.isPending || !ready) && <Spinner className="text-muted-foreground" aria-label={t("loading")} />}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={!ready || bulk.isPending} onClick={() => setPriceOpen(true)}>
          {t("changePrice")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={!ready || bulk.isPending || tags.length === 0}>
              <TagIcon data-icon="inline-start" />
              {t("tags")}
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{t("addTag")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {tags.map((tag) => (
                    <DropdownMenuItem key={tag.id} onSelect={() => run({ addTagIds: [tag.id] })}>
                      {tag.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{t("removeTag")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {tags.map((tag) => (
                    <DropdownMenuItem key={tag.id} onSelect={() => run({ removeTagIds: [tag.id] })}>
                      {tag.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={!ready || bulk.isPending}>
              {t("category")}
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("moveTo")}</DropdownMenuLabel>
              {categories.map((c) => (
                <DropdownMenuItem key={c.id} onSelect={() => run({ categoryId: c.id })}>
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => run({ categoryId: null })}>{t("noCategory")}</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="outline" disabled={!ready || bulk.isPending} onClick={() => run({ active: true })}>
          {t("activate")}
        </Button>
        <Button size="sm" variant="outline" disabled={!ready || bulk.isPending} onClick={() => run({ active: false })}>
          {t("deactivate")}
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label={t("clear")} onClick={onDone}>
          <XIcon />
        </Button>
      </div>
      {priceOpen && (
        <BulkPriceDialog
          selected={selected}
          pricing={pricing}
          pending={bulk.isPending}
          error={bulk.error}
          onClose={() => {
            bulk.reset();
            setPriceOpen(false);
          }}
          onApply={(price) => run({ price }, () => setPriceOpen(false))}
        />
      )}
    </div>
  );
}

function BulkPriceDialog({
  selected,
  pricing,
  pending,
  error,
  onClose,
  onApply,
}: {
  selected: Product[];
  pricing: ReadonlyMap<string, Pricing>;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onApply: (price: BulkPrice) => void;
}) {
  const t = useTranslations("vendorCatalogue.bulk");
  const tc = useTranslations("common");
  const [kind, setKind] = useState<BulkPrice["kind"]>("PERCENT_CHANGE");
  const [value, setValue] = useState("");
  const currency = pricing.get(selected[0]!.id)!.currency;
  const parsed = kind === "SET" ? parsePriceInput(value) : parsePercentChangeInput(value);
  const invalid = parsed === null;
  const withoutBase = selected.filter((p) => !pricing.get(p.id)?.basePrice);
  const blockedByBase = kind === "PERCENT_CHANGE" && withoutBase.length > 0;
  const results =
    parsed && kind === "PERCENT_CHANGE" && !blockedByBase
      ? selected.map((p) => ({ product: p, from: pricing.get(p.id)!.basePrice!, to: bulkPercentResult(pricing.get(p.id)!.basePrice!, parsed) }))
      : [];
  const broken = results.find((r) => r.to === null);
  const example = results[0];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("priceTitle")}</DialogTitle>
          <DialogDescription>{t("priceDescription", { count: selected.length, countText: formatNumber(selected.length) })}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!parsed || blockedByBase || broken) return;
            onApply({ kind, value: parsed });
          }}
        >
          <FieldGroup>
            <CatalogueFormError error={error} />
            <ToggleGroup type="single" variant="outline" value={kind} onValueChange={(v) => v && setKind(v as BulkPrice["kind"])} aria-label={t("howAria")}>
              <ToggleGroupItem value="PERCENT_CHANGE">{t("byPercent")}</ToggleGroupItem>
              <ToggleGroupItem value="SET">{t("toAmount")}</ToggleGroupItem>
            </ToggleGroup>
            <Field data-invalid={invalid || blockedByBase || !!broken || undefined}>
              <FieldLabel htmlFor="bulk-price">{kind === "PERCENT_CHANGE" ? t("changeLabel") : t("newPrice")}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="bulk-price"
                  inputMode="decimal"
                  autoFocus
                  className="font-mono"
                  aria-invalid={invalid || undefined}
                  placeholder={kind === "PERCENT_CHANGE" ? t("percentPlaceholder") : t("pricePlaceholder")}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{kind === "PERCENT_CHANGE" ? "%" : currencySymbol(currency)}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              {invalid ? (
                <FieldError>{kind === "PERCENT_CHANGE" ? t("percentInvalid") : t("priceInvalid")}</FieldError>
              ) : blockedByBase ? (
                <FieldError>{t("missingBase", { count: withoutBase.length, countText: formatNumber(withoutBase.length) })}</FieldError>
              ) : broken ? (
                <FieldError>{t("resultInvalid", { name: broken.product.name })}</FieldError>
              ) : (
                example?.to && (
                  <FieldDescription>
                    {t("example", { name: example.product.name, from: formatMoney(example.from, currency), to: formatMoney(example.to, currency) })}
                  </FieldDescription>
                )
              )}
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !parsed || blockedByBase || !!broken}>
              {pending && <Spinner data-icon="inline-start" />}
              {t("apply")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
