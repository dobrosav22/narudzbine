import { keepPreviousData, useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acknowledgeReconciliationLines,
  adjustStock,
  bulkEditProducts,
  catalogueKeys,
  catalogueQueries,
  confirmCsvImport,
  confirmStock,
  createProduct,
  createTaxonomyItem,
  deleteTaxonomyItem,
  disableTracking,
  enableTracking,
  inventoryKeys,
  inventoryQueries,
  planKeys,
  prepareReconciliation,
  previewCsvImport,
  removeAgreedPrice,
  renameTaxonomyItem,
  runProductCommand,
  setAgreedPrice,
  setProductFeatured,
  setProductGallery,
  setStock,
  updatePricing,
  updateProduct,
  type AgreedPriceInput,
  type BulkChange,
  type Product,
  type ProductCommand,
  type ProductInput,
  type ProductListQuery,
  type ProductUpdate,
  type PricingUpdate,
  type ReconciliationCandidate,
  type StockAbsolute,
  type StockDelta,
  type TaxonomyKind,
} from '@repo/core';

/*
 * Vendor catalogue hooks over @repo/core's factories. Every catalogue write invalidates the
 * ['catalogue'] prefix (lists, pricing, plan usage); stock writes invalidate ['inventory'].
 * Product responses are full resources, so they also patch the single-product cache.
 */

export function useTaxonomy<K extends TaxonomyKind>(kind: K) {
  return useQuery(catalogueQueries.taxonomy(kind));
}

export function useProducts(q: ProductListQuery) {
  return useQuery({ ...catalogueQueries.products(q), placeholderData: keepPreviousData });
}

/** Offset pages as an infinite list (mobile scrolling). */
export function useInfiniteProducts(q: Omit<ProductListQuery, 'page'>) {
  return useInfiniteQuery({
    queryKey: [...catalogueQueries.products({ ...q, page: 0 }).queryKey, 'infinite'],
    queryFn: ({ pageParam }: { pageParam: number }) => catalogueQueries.products({ ...q, page: pageParam }).queryFn(),
    initialPageParam: 0,
    getNextPageParam: (last, _all, lastPage) => (last.items.length < last.size ? undefined : lastPage + 1),
    placeholderData: keepPreviousData,
  });
}

export function useAllProducts() {
  return useQuery(catalogueQueries.allProducts());
}

export function useProduct(id: string | undefined) {
  return useQuery({ ...catalogueQueries.product(id ?? ''), enabled: !!id });
}

export function usePricing(productId: string | undefined) {
  return useQuery({ ...catalogueQueries.pricing(productId ?? ''), enabled: !!productId });
}

/** Pricing for each listed product (the product list carries no prices). */
export function usePricings(productIds: string[]) {
  return useQueries({ queries: productIds.map((id) => catalogueQueries.pricing(id)) });
}

export function usePlanUsage() {
  return useQuery(catalogueQueries.planUsage());
}

export function useCatalogueBuyers() {
  return useQuery(catalogueQueries.buyers());
}

export function useAgreedPrices(relationshipIds: string[]) {
  return useQueries({ queries: relationshipIds.map((id) => catalogueQueries.agreedPrices(id)) });
}

function useCatalogueInvalidation() {
  const qc = useQueryClient();
  return {
    qc,
    product: (product: Product) => {
      qc.setQueryData(catalogueKeys.product(product.id), product);
      // Product counts feed the plan usage shown elsewhere (non-archived product limit).
      return Promise.all([qc.invalidateQueries({ queryKey: catalogueKeys.all }), qc.invalidateQueries({ queryKey: planKeys.current() })]);
    },
    all: () => Promise.all([qc.invalidateQueries({ queryKey: catalogueKeys.all }), qc.invalidateQueries({ queryKey: planKeys.current() })]),
  };
}

export function useCreateProduct() {
  const inv = useCatalogueInvalidation();
  return useMutation({ mutationFn: (body: ProductInput) => createProduct(body), onSuccess: inv.product });
}

export function useUpdateProduct(productId: string) {
  const inv = useCatalogueInvalidation();
  return useMutation({ mutationFn: (body: ProductUpdate) => updateProduct(productId, body), onSuccess: inv.product });
}

export function useUpdatePricing(productId: string) {
  const inv = useCatalogueInvalidation();
  return useMutation({
    mutationFn: (body: PricingUpdate) => updatePricing(productId, body),
    onSuccess: (pricing) => {
      inv.qc.setQueryData(catalogueKeys.pricing(productId), pricing);
      return inv.all();
    },
  });
}

export function useProductCommand(productId: string) {
  const inv = useCatalogueInvalidation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ command, expectedRevision }: { command: ProductCommand; expectedRevision: string }) =>
      runProductCommand(productId, command, expectedRevision),
    onSuccess: async (product) => {
      await inv.product(product);
      // Archive/restore/activation change what stock confirmation and offers look like.
      await qc.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useSetFeatured() {
  const inv = useCatalogueInvalidation();
  return useMutation({
    mutationFn: ({ product, featured }: { product: Product; featured: boolean }) =>
      setProductFeatured(product.id, { expectedRevision: product.revision, featured }),
    onSuccess: inv.product,
  });
}

export function useSetGallery(productId: string) {
  const inv = useCatalogueInvalidation();
  return useMutation({
    mutationFn: ({ expectedRevision, assetIds }: { expectedRevision: string; assetIds: string[] }) =>
      setProductGallery(productId, expectedRevision, assetIds),
    onSuccess: inv.product,
  });
}

export function useBulkEdit() {
  const inv = useCatalogueInvalidation();
  return useMutation({ mutationFn: (body: BulkChange) => bulkEditProducts(body), onSuccess: () => inv.all() });
}

export function useTaxonomyMutations(kind: TaxonomyKind) {
  const inv = useCatalogueInvalidation();
  return {
    create: useMutation({ mutationFn: (body: { id: string; name: string }) => createTaxonomyItem(kind, body), onSuccess: () => inv.all() }),
    rename: useMutation({
      mutationFn: ({ id, ...body }: { id: string; expectedRevision: string; name: string }) => renameTaxonomyItem(kind, id, body),
      onSuccess: () => inv.all(),
    }),
    remove: useMutation({
      mutationFn: ({ id, expectedRevision }: { id: string; expectedRevision: string; name: string }) => deleteTaxonomyItem(kind, id, expectedRevision),
      onSuccess: () => inv.all(),
    }),
  };
}

export function useAgreedPriceMutations(productId: string) {
  const inv = useCatalogueInvalidation();
  return {
    set: useMutation({
      mutationFn: ({ relationshipId, body }: { relationshipId: string; body: AgreedPriceInput }) => setAgreedPrice(relationshipId, productId, body),
      onSuccess: (_r, v) => inv.qc.invalidateQueries({ queryKey: catalogueKeys.agreedPrices(v.relationshipId) }),
    }),
    remove: useMutation({
      mutationFn: ({ relationshipId, expectedRevision }: { relationshipId: string; expectedRevision: string }) =>
        removeAgreedPrice(relationshipId, productId, expectedRevision),
      onSuccess: (_r, v) => inv.qc.invalidateQueries({ queryKey: catalogueKeys.agreedPrices(v.relationshipId) }),
    }),
  };
}

export function useImportPreview(id: string | null) {
  return useQuery({ ...catalogueQueries.importPreview(id ?? ''), enabled: !!id, staleTime: Infinity, retry: false });
}

export function useImportMutations() {
  const inv = useCatalogueInvalidation();
  return {
    preview: useMutation({ mutationFn: (csv: Blob) => previewCsvImport(csv) }),
    confirm: useMutation({
      mutationFn: ({ previewId, expectedRevision }: { previewId: string; expectedRevision: string }) => confirmCsvImport(previewId, expectedRevision),
      onSuccess: () => inv.all(),
    }),
  };
}

// ── Inventory ──────────────────────────────────────────────────────────

export function useTracking() {
  return useQuery(inventoryQueries.tracking());
}

export function useStock(productId: string | undefined) {
  return useQuery({ ...inventoryQueries.stock(productId ?? ''), enabled: !!productId });
}

export function useStocks(productIds: string[]) {
  return useQueries({ queries: productIds.map((id) => inventoryQueries.stock(id)) });
}

export function useProductsById(productIds: string[]) {
  return useQueries({ queries: productIds.map((id) => catalogueQueries.product(id)) });
}

export function useStockEvents(productId?: string) {
  return useInfiniteQuery({
    ...inventoryQueries.events(productId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useReconciliation(id: string | null) {
  return useQuery({ ...inventoryQueries.reconciliation(id ?? ''), enabled: !!id, retry: false });
}

export function useReconciliationLines(id: string | null) {
  return useInfiniteQuery({
    ...inventoryQueries.reconciliationLines(id ?? ''),
    enabled: !!id,
    retry: false,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useInventoryMutations() {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: inventoryKeys.all }), qc.invalidateQueries({ queryKey: catalogueKeys.all })]);
  return {
    disable: useMutation({ mutationFn: (expectedRevision: string) => disableTracking(expectedRevision), onSuccess: refresh }),
    prepare: useMutation({ mutationFn: () => prepareReconciliation() }),
    acknowledge: useMutation({
      mutationFn: ({ previewId, expectedRevision, lines }: { previewId: string; expectedRevision: string; lines: ReconciliationCandidate[] }) =>
        acknowledgeReconciliationLines(previewId, expectedRevision, lines),
      onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: inventoryKeys.reconciliation(v.previewId) }),
    }),
    enable: useMutation({
      mutationFn: ({ previewId, expectedRevision }: { previewId: string; expectedRevision: string }) => enableTracking(previewId, expectedRevision),
      onSuccess: refresh,
    }),
  };
}

export function useStockMutations(productId: string) {
  const qc = useQueryClient();
  const done = (stock: unknown) => {
    qc.setQueryData(inventoryKeys.stock(productId), stock);
    return qc.invalidateQueries({ queryKey: inventoryKeys.all });
  };
  return {
    set: useMutation({ mutationFn: (body: StockAbsolute) => setStock(productId, body), onSuccess: done }),
    adjust: useMutation({
      mutationFn: ({ body, key }: { body: StockDelta; key: string }) => adjustStock(productId, body, key),
      // The replayed original response is not the current balance: refetch instead of patching.
      onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.all }),
    }),
    confirm: useMutation({ mutationFn: (expectedRevision: string) => confirmStock(productId, expectedRevision), onSuccess: done }),
  };
}
