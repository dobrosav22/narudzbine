"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, FileUpIcon, PackageSearchIcon, PlusIcon, SearchIcon, StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatMoney, formatNumber, productLimitReached, type Pricing, type Product, type ProductListQuery } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CatalogueNav } from "@/features/merchandising/catalogue-nav";
import { useBusiness } from "@/lib/session";
import { BulkActionsBar } from "./bulk-actions";
import { PlanLimitAlert, ProductStateBadge, ProductThumb } from "./parts";
import { usePlanUsage, usePricings, useProducts, useTaxonomy } from "./queries";

const ALL = "all";
const PAGE_SIZE = 25;
type StateFilter = typeof ALL | Product["state"];
type Sort = NonNullable<ProductListQuery["sort"]>;

/** Vendor catalogue: server-side search, filters, sort and paging; page selection drives atomic bulk edits. */
export function VendorCatalogueScreen() {
  const t = useTranslations("vendorCatalogue");
  const router = useRouter();
  const { organization } = useBusiness();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<StateFilter>(ALL);
  const [categoryId, setCategoryId] = useState(ALL);
  const [tagId, setTagId] = useState(ALL);
  const [sort, setSort] = useState<Sort>("NAME_ASC");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const q = useDeferredValue(search.trim());

  const query: ProductListQuery = {
    page,
    size: PAGE_SIZE,
    includeTotal: true,
    sort,
    ...(q ? { q } : {}),
    ...(state !== ALL ? { state } : {}),
    ...(categoryId !== ALL ? { categoryId } : {}),
    ...(tagId !== ALL ? { tagId } : {}),
  };
  const products = useProducts(query);
  const categories = useTaxonomy("categories");
  const tags = useTaxonomy("tags");
  const units = useTaxonomy("units");
  const plan = usePlanUsage();
  const items = useMemo(() => products.data?.items ?? [], [products.data]);
  const pricingResults = usePricings(items.map((p) => p.id));
  const pricingById = new Map<string, Pricing>();
  pricingResults.forEach((r, i) => r.data && pricingById.set(items[i]!.id, r.data));

  const names = useMemo(
    () => ({
      category: new Map(categories.data?.map((c) => [c.id, c.name])),
      tag: new Map(tags.data?.map((c) => [c.id, c.name])),
      unit: new Map(units.data?.map((c) => [c.id, c.name])),
    }),
    [categories.data, tags.data, units.data],
  );

  const selected = items.filter((p) => selectedIds.has(p.id));
  const allSelected = items.length > 0 && items.every((p) => selectedIds.has(p.id));
  const filtering = q !== "" || state !== ALL || categoryId !== ALL || tagId !== ALL;
  const atLimit = productLimitReached(plan.data);
  const total = products.data?.total ?? null;
  const lastPage = total !== null ? Math.max(0, Math.ceil(total / PAGE_SIZE) - 1) : page;

  /** Any filter change starts from the first page with nothing selected. */
  const refilter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
    setSelectedIds(new Set());
  };
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
            {organization.displayName}
            {plan.data &&
              ` · ${t("usage", {
                count: plan.data.nonArchivedProductCount,
                countText: formatNumber(plan.data.nonArchivedProductCount),
                limit: formatNumber(plan.data.plan.productLimit),
              })}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/vendor/catalogue/import">
              <FileUpIcon data-icon="inline-start" />
              {t("importCsv")}
            </Link>
          </Button>
          {atLimit ? (
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

      {atLimit && <PlanLimitAlert plan={plan.data} />}

      <CatalogueNav />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <InputGroup className="lg:max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            maxLength={100}
            onChange={(e) => refilter(setSearch)(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
          />
        </InputGroup>
        <div className="flex flex-wrap gap-2">
          <Select value={state} onValueChange={refilter((v: string) => setState(v as StateFilter))}>
            <SelectTrigger className="w-40" aria-label={t("filterState")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL}>{t("allStates")}</SelectItem>
                {(["ACTIVE", "INACTIVE", "ARCHIVED"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`state.${s}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select value={categoryId} onValueChange={refilter(setCategoryId)}>
            <SelectTrigger className="w-44" aria-label={t("filterCategory")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL}>{t("allCategories")}</SelectItem>
                {categories.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select value={tagId} onValueChange={refilter(setTagId)}>
            <SelectTrigger className="w-40" aria-label={t("filterTag")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL}>{t("allTags")}</SelectItem>
                {tags.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={refilter((v: string) => setSort(v as Sort))}>
            <SelectTrigger className="w-40" aria-label={t("sortAria")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="NAME_ASC">{t("sortName")}</SelectItem>
                <SelectItem value="CREATED_DESC">{t("sortNewest")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {selected.length > 0 && (
        <BulkActionsBar
          selected={selected}
          pricing={pricingById}
          categories={categories.data ?? []}
          tags={tags.data ?? []}
          onDone={() => setSelectedIds(new Set())}
        />
      )}

      {products.isPending ? (
        <RowsSkeleton />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageSearchIcon}
          title={filtering ? t("noMatches") : t("emptyTitle")}
          description={filtering ? t("noMatchesHint") : t("emptyDescription")}
        >
          {!filtering && !atLimit && (
            <Button asChild>
              <Link href="/vendor/catalogue/new">
                <PlusIcon data-icon="inline-start" />
                {t("addProduct")}
              </Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={t("selectAll")}
                      checked={allSelected ? true : selected.length > 0 ? "indeterminate" : false}
                      onCheckedChange={(on) => setSelectedIds(on === true ? new Set(items.map((p) => p.id)) : new Set())}
                    />
                  </TableHead>
                  <TableHead className="w-32">{t("sku")}</TableHead>
                  <TableHead>{t("product")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("category")}</TableHead>
                  <TableHead className="text-right">{t("basePrice")}</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">{t("quantities")}</TableHead>
                  <TableHead className="text-right">{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p, i) => (
                  <TableRow
                    key={p.id}
                    data-state={selectedIds.has(p.id) ? "selected" : undefined}
                    className={`cursor-pointer ${p.state === "ACTIVE" ? "" : "text-muted-foreground"}`}
                    onClick={() => router.push(`/vendor/catalogue/${p.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox aria-label={t("select", { name: p.name })} checked={selectedIds.has(p.id)} onCheckedChange={(on) => toggle(p.id, on === true)} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ProductThumb assetId={p.galleryAssetIds[0]} className="size-10" />
                        <div className="flex min-w-0 flex-col gap-1">
                          <Link href={`/vendor/catalogue/${p.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                            {p.name}
                          </Link>
                          {(p.featured || p.tagIds.length > 0) && (
                            <div className="flex flex-wrap gap-1">
                              {p.featured && (
                                <Badge variant="info">
                                  <StarIcon data-icon="inline-start" />
                                  {t("featured")}
                                </Badge>
                              )}
                              {p.tagIds.map((id) => names.tag.get(id) && <Badge key={id} variant="outline">{names.tag.get(id)}</Badge>)}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{(p.categoryId && names.category.get(p.categoryId)) || "—"}</TableCell>
                    <TableCell className="text-right">
                      <PriceCell pricing={pricingResults[i]?.data} pending={!!pricingResults[i]?.isPending} unit={p.unitId ? names.unit.get(p.unitId) : undefined} />
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums lg:table-cell">
                      {formatNumber(p.minimumQuantity)} / {formatNumber(p.quantityStep)}
                    </TableCell>
                    <TableCell className="text-right">
                      <ProductStateBadge state={p.state} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {total !== null && t("total", { count: total, countText: formatNumber(total) })} · {t("netNote")}
            </span>
            <div className="flex items-center gap-2">
              <span>{t("page", { page: formatNumber(page + 1) })}</span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("previous")}
                disabled={page === 0 || products.isPlaceholderData}
                onClick={() => {
                  setPage((n) => n - 1);
                  setSelectedIds(new Set());
                }}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("next")}
                disabled={page >= lastPage || items.length < PAGE_SIZE || products.isPlaceholderData}
                onClick={() => {
                  setPage((n) => n + 1);
                  setSelectedIds(new Set());
                }}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PriceCell({ pricing, pending, unit }: { pricing: Pricing | undefined; pending: boolean; unit: string | undefined }) {
  const t = useTranslations("vendorCatalogue");
  if (pending) return <Skeleton className="ml-auto h-4 w-16" />;
  if (!pricing?.basePrice) return <span className="text-muted-foreground">{t("noPrice")}</span>;
  return (
    <span className="font-mono tabular-nums">
      {formatMoney(pricing.basePrice, pricing.currency)}
      {unit && <span className="font-sans text-muted-foreground"> / {unit}</span>}
    </span>
  );
}
