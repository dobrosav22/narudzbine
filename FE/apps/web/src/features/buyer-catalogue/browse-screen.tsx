"use client";

import { useDeferredValue, useState } from "react";
import { useTranslations } from "next-intl";
import { PackageSearchIcon, SearchIcon, UnplugIcon } from "lucide-react";
import { formatNumber, type Offer, type OfferSort } from "@repo/core";
import { EmptyState, ErrorState } from "@/components/query-states";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useBusiness } from "@/lib/session";
import { ProductCard } from "./product-card";
import { useFeaturedOffers, useMostOrdered, useOfferList, useOfferTaxonomy } from "./queries";
import { useVendorContext } from "./vendor-context";

const ALL = "all";

/**
 * Buyer home: the active vendor's buyer-specific offers (GET /vendors/{id}/offers) with search,
 * sort and category/tag filters, plus the vendor's featured shelf and the buyer's most-ordered
 * shelf. Prices are this buyer's current prices at each product's minimum quantity (excl. VAT).
 */
export function BrowseScreen() {
  const t = useTranslations("browse");
  const { active, isPending, error, refetch } = useVendorContext();
  if (isPending) return <CardGridSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!active) return <EmptyState icon={UnplugIcon} title={t("noVendorsTitle")} description={t("noVendorsDescription")} />;
  // key: switching vendor resets filters instead of carrying another vendor's category over.
  return <Browse key={active.vendorId} vendorId={active.vendorId} vendorName={active.displayName} />;
}

function Browse({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const t = useTranslations("browse");
  const { organization } = useBusiness();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<OfferSort>("NAME_ASC");
  const [categoryId, setCategoryId] = useState(ALL);
  const [tagId, setTagId] = useState(ALL);
  const q = useDeferredValue(search);
  const taxonomy = useOfferTaxonomy(vendorId);
  const featured = useFeaturedOffers(vendorId);
  const mostOrdered = useMostOrdered(vendorId);
  const offers = useOfferList(vendorId, {
    q,
    sort,
    categoryId: categoryId === ALL ? undefined : categoryId,
    tagId: tagId === ALL ? undefined : tagId,
  });
  const filtering = search.trim() !== "" || categoryId !== ALL || tagId !== ALL;
  const items = offers.data?.pages.flatMap((p) => p.items) ?? [];
  const total = offers.data?.pages[0]?.total ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{vendorName}</h1>
        <p className="text-sm text-muted-foreground">{t("orderingFor", { buyer: organization.displayName })}</p>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row">
        <InputGroup className="lg:max-w-sm">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder", { vendor: vendorName })}
            aria-label={t("searchAria")}
          />
        </InputGroup>
        <div className="flex flex-wrap gap-2">
          {taxonomy.data && taxonomy.data.categories.length > 0 && (
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-44" aria-label={t("filterCategory")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL}>{t("allCategories")}</SelectItem>
                  {taxonomy.data.categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          {taxonomy.data && taxonomy.data.tags.length > 0 && (
            <Select value={tagId} onValueChange={setTagId}>
              <SelectTrigger className="w-40" aria-label={t("filterTag")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL}>{t("allTags")}</SelectItem>
                  {taxonomy.data.tags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          <Select value={sort} onValueChange={(v) => setSort(v as OfferSort)}>
            <SelectTrigger className="w-40" aria-label={t("sort")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="NAME_ASC">{t("sortName")}</SelectItem>
                <SelectItem value="CREATED_DESC">{t("sortNewest")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {filtering && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setCategoryId(ALL);
                setTagId(ALL);
              }}
            >
              {t("clearFilters")}
            </Button>
          )}
        </div>
      </div>

      {!filtering && (
        <>
          <Shelf title={t("featuredBy", { vendor: vendorName })} query={featured} />
          <Shelf title={t("mostOrdered")} query={mostOrdered} description={t("mostOrderedHint")} />
        </>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="all-products">
        <h2 id="all-products" className="text-lg font-semibold">
          {filtering ? t("results") : t("allProducts")}
          {total !== null && <span className="ml-1 text-sm font-normal text-muted-foreground"> {formatNumber(total)}</span>}
        </h2>
        {offers.isError ? (
          <ErrorState error={offers.error} onRetry={() => void offers.refetch()} />
        ) : offers.isPending ? (
          <CardGridSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={PackageSearchIcon}
            title={filtering ? t("noMatches") : t("noProducts")}
            description={filtering ? t("noMatchesHint") : undefined}
          />
        ) : (
          <>
            <CardGrid items={items} />
            {offers.hasNextPage && (
              <div className="flex justify-center">
                <Button variant="outline" disabled={offers.isFetchingNextPage} onClick={() => void offers.fetchNextPage()}>
                  {offers.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                  {t("loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** A horizontal-ish shelf of up to four offers; hidden when empty, quiet on error (the main list still works). */
function Shelf({
  title,
  description,
  query,
}: {
  title: string;
  description?: string;
  query: { data?: Offer[]; isPending: boolean; isError: boolean };
}) {
  if (query.isError || (query.data && query.data.length === 0)) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {query.data ? <CardGrid items={query.data.slice(0, 4)} /> : <CardGridSkeleton count={4} />}
    </section>
  );
}

function CardGrid({ items }: { items: Offer[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((offer) => (
        <ProductCard key={offer.product.id} offer={offer} />
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
