import type {
  BuyerStat,
  BuyerSummary,
  MostOrderedItem,
  ProductStat,
  StatsFilter,
  VendorSummary,
} from '../types';

/** All read-only aggregations; shapes are [assumed] (04 → "Stats"). */
export interface StatsService {
  getVendorSummary(vendorOrgId: string): Promise<VendorSummary>;
  /** locationId here = fulfilling VendorLocation. */
  byProduct(vendorOrgId: string, filter?: StatsFilter): Promise<ProductStat[]>;
  byBuyer(vendorOrgId: string, filter?: StatsFilter): Promise<BuyerStat[]>;
  /** locationId here = buyer delivery Location. */
  getBuyerSummary(buyerOrgId: string, vendorOrgId: string, filter?: StatsFilter): Promise<BuyerSummary>;
  /** GET /buyer-orgs/:id/most-ordered?vendorOrgId= — derived from order history. */
  getMostOrdered(buyerOrgId: string, vendorOrgId: string, limit?: number): Promise<MostOrderedItem[]>;
}
