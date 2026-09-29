"use client";

import { useDeferredValue, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, PackageSearchIcon, SearchIcon, UnplugIcon } from "lucide-react";
import { formatNumber, type CatalogueItem } from "@repo/core";
import { EmptyState, ErrorState } from "@/components/query-states";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useSignedIn } from "@/lib/session";
import { ProductCard } from "./product-card";
import { useBuyerCatalogue, useBuyerShelves, useCategories, useTags } from "./queries";

const ALL = "all";

/**
 * 03 → buyer "Catalogue browse (Home)": featured shelf (vendor-curated),
 * most-ordered shelf (this buyer's history with the active vendor), search and
 * category/tag filters. Everything is scoped to the active vendor.
 */
export function BrowseScreen() {
  const t = useTranslations("browse");
  const { membership, activeVendor } = useSignedIn();
  if (!activeVendor) {
    return (
      <EmptyState
        icon={UnplugIcon}
        title={t("noVendorsTitle")}
        description={t("noVendorsDescription")}
      />
    );
  }
  // key: switching vendor resets filters instead of carrying another vendor's category over.
  return <Browse key={activeVendor.id} vendorOrgId={activeVendor.id} vendorName={activeVendor.name} buyerOrgId={membership.org.id} buyerName={membership.org.name} />;
}

function Browse({
  vendorOrgId,
  vendorName,
  buyerOrgId,
  buyerName,
}: {
  vendorOrgId: string;
  vendorName: string;
  buyerOrgId: string;
  buyerName: string;
}) {
  const t = useTranslations("browse");
  const scope = { vendorOrgId, buyerOrgId };
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState(ALL);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const deferredSearch = useDeferredValue(search);
  const categories = useCategories(vendorOrgId);
  const tags = useTags(vendorOrgId);
  const shelves = useBuyerShelves(scope);
  const catalogue = useBuyerCatalogue(scope, {
    search: deferredSearch,
    categoryId: categoryId === ALL ? undefined : categoryId,
    tagIds,
  });
  const filtering = search !== "" || categoryId !== ALL || tagIds.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{vendorName}</h1>
        <p className="text-sm text-muted-foreground">{t("orderingFor", { buyer: buyerName })}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <InputGroup className="sm:max-w-sm">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder", { vendor: vendorName })}
            aria-label={t("searchAria")}
          />
        </InputGroup>
        <div className="flex gap-2">
          <Select value={categoryId} onValueChange={setCategoryId}>
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
          {tags.data && tags.data.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label={t("filterTag")}>
                  {tagIds.length ? t("tagsCount", { count: formatNumber(tagIds.length) }) : t("allTags")}
                  <ChevronDownIcon data-icon="inline-end" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                <DropdownMenuGroup>
                  {tags.data.map((t) => (
                    <DropdownMenuCheckboxItem
                      key={t.id}
                      checked={tagIds.includes(t.id)}
                      onCheckedChange={(on) => setTagIds((ids) => (on ? [...ids, t.id] : ids.filter((x) => x !== t.id)))}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {t.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
                {tagIds.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem onSelect={() => setTagIds([])}>{t("clearTags")}</DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {!filtering && (
        <>
          {shelves.isError ? (
            <ErrorState error={shelves.error} onRetry={() => void shelves.refetch()} />
          ) : shelves.isPending ? (
            <Shelf title={t("featured")} items={undefined} />
          ) : (
            <>
              {shelves.data.featured.length > 0 && <Shelf title={t("featuredBy", { vendor: vendorName })} items={shelves.data.featured} />}
              {shelves.data.mostOrdered.length > 0 && (
                <Shelf
                  title={t("mostOrdered")}
                  items={shelves.data.mostOrdered}
                  extra={(i) => {
                    const m = shelves.data.mostOrdered.find((x) => x.product.id === i.product.id);
                    return m ? t("orderedTimes", { count: formatNumber(m.orderCount) }) : undefined;
                  }}
                />
              )}
            </>
          )}
        </>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="all-products">
        <h2 id="all-products" className="text-lg font-semibold">
          {filtering ? t("results") : t("allProducts")}
          {catalogue.data && <span className="ml-1 text-sm font-normal text-muted-foreground">{" "}{formatNumber(catalogue.data.length)}</span>}
        </h2>
        {catalogue.isError ? (
          <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />
        ) : catalogue.isPending ? (
          <CardGridSkeleton />
        ) : catalogue.data.length === 0 ? (
          <EmptyState
            icon={PackageSearchIcon}
            title={filtering ? t("noMatches") : t("noProducts")}
            description={filtering ? t("noMatchesHint") : undefined}
          />
        ) : (
          <CardGrid items={catalogue.data} />
        )}
      </section>
    </div>
  );
}

function Shelf({
  title,
  items,
  extra,
}: {
  title: string;
  items: CatalogueItem[] | undefined;
  extra?: (item: CatalogueItem) => string | undefined;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {items ? <CardGrid items={items.slice(0, 4)} extra={extra} /> : <CardGridSkeleton count={4} />}
    </section>
  );
}

function CardGrid({ items, extra }: { items: CatalogueItem[]; extra?: (item: CatalogueItem) => string | undefined }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <ProductCard key={item.product.id} item={item} extra={extra?.(item)} />
      ))}
    </div>
  );
}

function CardGridSkeleton({ count = 8 }: { count?: number }) {
  const ts = useTranslations("states");
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label={ts("loading")}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-44 w-full" />
      ))}
    </div>
  );
}
