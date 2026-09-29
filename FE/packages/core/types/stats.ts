// [assumed] 04 → "Stats": aggregation shape is explicitly unsettled. These
// are the shapes the mocks produce so screens have something to chart.
import type { Order } from './orders';
import type { Product } from './catalogue';

export type StatsPeriod = '30d' | '90d' | '12m' | 'all';

export interface PeriodBucket {
  /** 'YYYY-MM' */
  period: string;
  revenue: number;
  orderCount: number;
}

export interface VendorSummary {
  vendorOrgId: string;
  revenueLast30d: number;
  ordersLast30d: number;
  openOrders: number;
  activeBuyers: number;
  revenueByMonth: PeriodBucket[];
  recentOrders: Order[];
  /** Empty when the vendor doesn't track inventory. */
  lowStockProducts: Product[];
}

export interface ProductStat {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  units: number;
  revenue: number;
  orderCount: number;
  trend: PeriodBucket[];
}

export interface BuyerStat {
  buyerOrgId: string;
  buyerName: string;
  orderCount: number;
  spend: number;
  lastOrderAt?: string;
}

export interface BuyerSummary {
  buyerOrgId: string;
  vendorOrgId: string;
  totalSpend: number;
  orderCount: number;
  byProduct: { productId: string; productName: string; units: number; spend: number }[];
  byPeriod: PeriodBucket[];
}

export interface MostOrderedItem {
  product: Product;
  totalQuantity: number;
  orderCount: number;
}

export interface StatsFilter {
  period?: StatsPeriod;
  /** Buyer Location id or VendorLocation id depending on the endpoint. */
  locationId?: string;
}
