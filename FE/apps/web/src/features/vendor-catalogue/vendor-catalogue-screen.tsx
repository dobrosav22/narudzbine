"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, PackageSearchIcon, PlusIcon, SearchIcon, Settings2Icon } from "lucide-react";
import { formatMoney, formatNumber, isAtLimit, LOW_STOCK_THRESHOLD, usageLine, type Product } from "@repo/core";
import { ProductImage } from "@/components/product-image";
import { ErrorState, EmptyState, RowsSkeleton } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PlanLimitNotice } from "@/features/subscription/plan-limit";
import { CatalogueNav } from "@/features/merchandising/catalogue-nav";
import { BulkActionsBar } from "./bulk-actions";
import { TaxonomySheet } from "./taxonomy-sheet";
import { useCategories, useVendorPlan, useTags, useVendorOrg, useVendorProducts } from "./queries";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

const ALL = "all";
type StatusFilter = "all" | "active" | "inactive";

/** 03 → "Catalogue": table view, filter/search by category/tag, bulk-select for bulk price/tag edits. */
export function VendorCatalogueScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useTranslations("vendorCatalogue");
  const tb = useTranslations("browse");
  const tm = useMsg();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState(ALL);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const org = useVendorOrg(vendorOrgId);
  const categories = useCategories(vendorOrgId);
  const tags = useTags(vendorOrgId);
  const usage = useVendorPlan(vendorOrgId);
  const products = useVendorProducts({
    vendorOrgId,
    search: deferredSearch,
    categoryId: categoryId === ALL ? undefined : categoryId,
    tagIds,
  });

  const categoryName = useMemo(() => new Map(categories.data?.map((c) => [c.id, c.name])), [categories.data]);
  const tagName = useMemo(() => new Map(tags.data?.map((t) => [t.id, t.name])), [tags.data]);
  const visible = useMemo(
    () =>
      (products.data ?? []).filter((p) => (status === "all" ? true : status === "active" ? p.isActive : !p.isActive)),
    [products.data, status],
  );
  // Selection survives filtering, but only rows still in the catalogue count.
  const selected = useMemo(() => (products.data ?? []).filter((p) => selectedIds.has(p.id)), [products.data, selectedIds]);
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selectedIds.has(p.id));
  const someVisibleSelected = visible.some((p) => selectedIds.has(p.id));
  const filtering = search !== "" || categoryId !== ALL || tagIds.length > 0 || status !== "all";
  const atLimit = isAtLimit(usage.data, "products");

  const toggle = (id: string, on: boolean) =>
    setSelectedIds((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {org.data ? org.data.name : " "}
            {usage.data && ` · ${tm(usageLine(usage.data, "products"))}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTaxonomyOpen(true)}>
            <Settings2Icon data-icon="inline-start" />
            {t("taxonomy")}
          </Button>
          {/* v1.1 hard block (01 §2): usage is checked first; at or over the limit the control is disabled outright. */}
          {atLimit || !usage.data ? (
            <Button disabled>
              <PlusIcon data-icon="inline-start" />
              {t("addProduct")}
            </Button>
          ) : (
            <Button asChild>
              <Link href="/vendor/catalogue/new">
                <PlusIcon data-icon="inline-start" />
                {t("addProduct")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {usage.data && atLimit && <PlanLimitNotice plan={usage.data} limit="products" />}

      <CatalogueNav />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <InputGroup className="lg:max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={tb("searchAria")}
          />
        </InputGroup>
        <div className="flex flex-wrap gap-2">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-44" aria-label={tb("filterCategory")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL}>{tb("allCategories")}</SelectItem>
                {categories.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label={tb("filterTag")}>
                {tagIds.length ? tb("tagsCount", { count: tagIds.length }) : tb("allTags")}
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              <DropdownMenuGroup>
                {tags.data?.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={tagIds.includes(tag.id)}
                    onCheckedChange={(on) => setTagIds((ids) => (on ? [...ids, tag.id] : ids.filter((x) => x !== tag.id)))}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {tag.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              {tagIds.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onSelect={() => setTagIds([])}>{tb("clearTags")}</DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <ToggleGroup
            type="single"
            variant="outline"
            value={status}
            onValueChange={(v) => v && setStatus(v as StatusFilter)}
            aria-label={t("filterStatus")}
          >
            <ToggleGroupItem value="all">{t("all")}</ToggleGroupItem>
            <ToggleGroupItem value="active">{t("active")}</ToggleGroupItem>
            <ToggleGroupItem value="inactive">{t("inactive")}</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {selected.length > 0 && (
        <BulkActionsBar
          vendorOrgId={vendorOrgId}
          selected={selected}
          categories={categories.data ?? []}
          tags={tags.data ?? []}
          onDone={() => setSelectedIds(new Set())}
        />
      )}

      {products.isPending || org.isPending ? (
        <RowsSkeleton />
      ) : products.isError || org.isError ? (
        <ErrorState
          error={products.error ?? org.error}
          onRetry={() => {
            void products.refetch();
            void org.refetch();
          }}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={PackageSearchIcon}
          title={filtering ? tb("noMatches") : t("emptyTitle")}
          description={filtering ? t("noMatchesHint") : t("emptyDescription")}
        >
          {!filtering && (
            <Button asChild>
              <Link href="/vendor/catalogue/new">
                <PlusIcon data-icon="inline-start" />
                {t("addProduct")}
              </Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label={t("selectAll")}
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    onCheckedChange={(on) =>
                      setSelectedIds((s) => {
                        const next = new Set(s);
                        for (const p of visible) {
                          if (on === true) next.add(p.id);
                          else next.delete(p.id);
                        }
                        return next;
                      })
                    }
                  />
                </TableHead>
                <TableHead className="w-32">{t("sku")}</TableHead>
                <TableHead>{t("product")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("category")}</TableHead>
                <TableHead className="text-right">{t("basePrice")}</TableHead>
                {org.data.tracksInventory && <TableHead className="text-right">{t("stock")}</TableHead>}
                <TableHead className="hidden text-right lg:table-cell">{t("minQty")}</TableHead>
                <TableHead className="text-right">{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((p) => (
                <TableRow
                  key={p.id}
                  data-state={selectedIds.has(p.id) ? "selected" : undefined}
                  className={`cursor-pointer ${p.isActive ? "" : "text-muted-foreground"}`}
                  onClick={() => router.push(`/vendor/catalogue/${p.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={t("select", { name: p.name })}
                      checked={selectedIds.has(p.id)}
                      onCheckedChange={(on) => toggle(p.id, on === true)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ProductImage src={p.imageUrl} className="size-10" />
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/vendor/catalogue/${p.id}`}
                          className="font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.name}
                        </Link>
                        {/* Tags render once their names have loaded — no placeholder flash. */}
                        {p.tagIds.length > 0 && tags.data && (
                          <div className="flex flex-wrap gap-1">
                            {p.tagIds.map((id) => (
                              <Badge key={id} variant="outline">
                                {tagName.get(id)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {p.categoryId ? categoryName.get(p.categoryId) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatMoney(p.basePrice)}
                    <span className="font-sans text-muted-foreground"> / {p.unit}</span>
                  </TableCell>
                  {org.data.tracksInventory && (
                    <TableCell className="text-right">
                      <StockCell product={p} />
                    </TableCell>
                  )}
                  <TableCell className="hidden text-right font-mono tabular-nums lg:table-cell">
                    {p.minOrderQuantity ? formatNumber(p.minOrderQuantity) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={p.isActive ? "success" : "secondary"}>{p.isActive ? t("active") : t("inactive")}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TaxonomySheet vendorOrgId={vendorOrgId} open={taxonomyOpen} onOpenChange={setTaxonomyOpen} />
    </div>
  );
}

/** Stock is optional everywhere (01 §3) — this cell only renders for tracking vendors. */
function StockCell({ product }: { product: Product }) {
  const t = useTranslations("vendorCatalogue");
  if (product.stock === undefined) return <span className="text-muted-foreground">—</span>;
  if (product.stock === 0) return <Badge variant="destructive">{t("outOfStock")}</Badge>;
  return (
    <span className="inline-flex items-center justify-end gap-2 font-mono tabular-nums">
      {product.stock <= LOW_STOCK_THRESHOLD && <Badge variant="warning">{t("low")}</Badge>}
      {formatNumber(product.stock)}
    </span>
  );
}
