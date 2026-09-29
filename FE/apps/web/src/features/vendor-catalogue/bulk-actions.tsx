"use client";

import { useState } from "react";
import { ChevronDownIcon, TagIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  currencySymbol,
  formatMoney,
  formatNumber,
  parseDecimal,
  roundMoney,
  type BulkUpdateProductsInput,
  type Category,
  type Product,
  type Tag,
} from "@repo/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { FormError } from "@/features/auth/form-error";
import { useBulkUpdate } from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText } from "@/lib/i18n";

type BulkChange = Omit<BulkUpdateProductsInput, "vendorOrgId" | "productIds">;

/** 01 §3: bulk price/tag edits for vendors with many SKUs — table selection + this bar. */
export function BulkActionsBar({
  vendorOrgId,
  selected,
  categories,
  tags,
  onDone,
}: {
  vendorOrgId: string;
  selected: Product[];
  categories: Category[];
  tags: Tag[];
  onDone: () => void;
}) {
  const t = useTranslations("vendorCatalogue.bulk");
  const errorText = useErrorText();
  const bulk = useBulkUpdate(vendorOrgId);
  const [priceOpen, setPriceOpen] = useState(false);
  const count = selected.length;
  const n = { count, countText: formatNumber(count) };

  const apply = (change: BulkChange, message: string) =>
    bulk.mutate(
      { ...change, productIds: selected.map((p) => p.id) },
      {
        onSuccess: () => toast.success(message),
        onError: (e) => toast.error(errorText(e)),
      },
    );

  return (
    <div
      role="toolbar"
      aria-label={t("aria")}
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-2"
    >
      <span className="px-1 text-sm font-medium">
        {t("selected", n)}
      </span>
      {bulk.isPending && <Spinner className="text-muted-foreground" />}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setPriceOpen(true)}>
          {t("changePrice")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
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
                    <DropdownMenuItem key={tag.id} onSelect={() => apply({ addTagIds: [tag.id] }, t("tagged", { ...n, tag: tag.name }))}>
                      {tag.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{t("removeTag")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {tags.map((tag) => (
                    <DropdownMenuItem
                      key={tag.id}
                      onSelect={() => apply({ removeTagIds: [tag.id] }, t("untagged", { ...n, tag: tag.name }))}
                    >
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
            <Button size="sm" variant="outline">
              {t("category")}
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("moveTo")}</DropdownMenuLabel>
              {categories.map((c) => (
                <DropdownMenuItem key={c.id} onSelect={() => apply({ categoryId: c.id }, t("moved", { ...n, category: c.name }))}>
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => apply({ categoryId: null }, t("uncategorized", n))}>
                {t("noCategory")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="outline" onClick={() => apply({ isActive: true }, t("activated", n))}>
          {t("activate")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => apply({ isActive: false }, t("deactivated", n))}>
          {t("deactivate")}
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label={t("clear")} onClick={onDone}>
          <XIcon />
        </Button>
      </div>
      <BulkPriceDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        selected={selected}
        pending={bulk.isPending}
        error={bulk.error}
        onApply={(price, message) =>
          bulk.mutate(
            { price, productIds: selected.map((p) => p.id) },
            {
              onSuccess: () => {
                toast.success(message);
                setPriceOpen(false);
              },
            },
          )
        }
      />
    </div>
  );
}

function BulkPriceDialog({
  open,
  onOpenChange,
  selected,
  pending,
  error,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: Product[];
  pending: boolean;
  error: unknown;
  onApply: (price: NonNullable<BulkChange["price"]>, message: string) => void;
}) {
  const t = useTranslations("vendorCatalogue.bulk");
  const [kind, setKind] = useState<"percent" | "set">("percent");
  const [value, setValue] = useState("");
  const parsed = parseDecimal(value);
  const invalid =
    value.trim() !== "" &&
    (parsed === undefined || (kind === "set" ? parsed < 0 : parsed <= -100 || parsed > 1000));
  const example = selected[0];
  const preview =
    example && parsed !== undefined && !invalid
      ? kind === "set"
        ? parsed
        : Math.max(0, roundMoney(example.basePrice * (1 + parsed / 100)))
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("priceTitle")}</DialogTitle>
          <DialogDescription>{t("priceDescription", { count: selected.length, countText: formatNumber(selected.length) })}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed === undefined || invalid) return;
            onApply(
              { kind, value: parsed },
              kind === "set"
                ? t("priceSet", { count: selected.length, countText: formatNumber(selected.length), price: formatMoney(parsed) })
                : t("priceChanged", {
                    count: selected.length,
                    countText: formatNumber(selected.length),
                    percent: `${parsed > 0 ? "+" : ""}${formatNumber(parsed)}`,
                  }),
            );
          }}
        >
          <FieldGroup>
            <FormError error={error} />
            <ToggleGroup
              type="single"
              variant="outline"
              value={kind}
              onValueChange={(v) => v && setKind(v as "percent" | "set")}
              aria-label={t("howAria")}
            >
              <ToggleGroupItem value="percent">{t("byPercent")}</ToggleGroupItem>
              <ToggleGroupItem value="set">{t("toAmount")}</ToggleGroupItem>
            </ToggleGroup>
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="bulk-price">{kind === "percent" ? t("changeLabel") : t("newPrice")}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="bulk-price"
                  inputMode="decimal"
                  autoFocus
                  aria-invalid={invalid || undefined}
                  placeholder={kind === "percent" ? t("percentPlaceholder") : t("pricePlaceholder")}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{kind === "percent" ? "%" : currencySymbol()}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              {invalid ? (
                <FieldError>
                  {kind === "percent" ? t("percentInvalid") : t("priceInvalid")}
                </FieldError>
              ) : (
                preview !== undefined &&
                example && (
                  <FieldDescription>
                    {t("example", { name: example.name, from: formatMoney(example.basePrice), to: formatMoney(preview) })}
                  </FieldDescription>
                )
              )}
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || parsed === undefined || invalid}>
              {pending && <Spinner data-icon="inline-start" />}
              {t("apply")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
