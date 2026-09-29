// Mirrors 04-data-contract-api-outline.md → "Orders".

export interface OrderStatus {
  key: string;
  label: string;
  isTerminal: boolean;
  isCancelled: boolean;
}

export interface VendorOrderStatusConfig {
  vendorOrgId: string;
  statuses: OrderStatus[]; // ordered list; seeded with a sane default on vendor signup
}

export interface Order {
  id: string;
  vendorOrgId: string;
  buyerOrgId: string;
  locationId: string; // buyer delivery location
  fulfillingLocationId?: string; // vendor warehouse, logistics-only
  createdByUserId: string; // BuyerUser who placed it
  statusKey: string; // references this vendor's status config
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  priceAtOrder: number; // snapshot, not live-resolved
}

export interface OrderMessage {
  id: string;
  orderId: string;
  senderUserId: string;
  senderOrgType: 'vendor' | 'buyer';
  text: string;
  createdAt: string;
}
