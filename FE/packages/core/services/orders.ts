import type {
  CreateOrderInput,
  ListOrdersParams,
  Order,
  OrderMessage,
  OrderStatus,
  ReorderResult,
  VendorOrderStatusConfig,
} from '../types';

export interface OrdersService {
  /** Newest first. */
  listOrders(params: ListOrdersParams): Promise<Order[]>;
  getOrder(orderId: string): Promise<Order>;
  /** Prices are resolved and snapshotted server-side; status = vendor's first configured status. */
  createOrder(input: CreateOrderInput): Promise<Order>;
  updateOrderStatus(orderId: string, statusKey: string): Promise<Order>;
  listOrderMessages(orderId: string): Promise<OrderMessage[]>;
  addOrderMessage(
    orderId: string,
    input: { senderUserId: string; senderOrgType: 'vendor' | 'buyer'; text: string },
  ): Promise<OrderMessage>;
  /** POST /orders/:id/reorder — lines to put in a fresh cart; prices re-resolve in the cart. */
  reorder(orderId: string): Promise<ReorderResult>;
}

export interface OrderStatusConfigService {
  get(vendorOrgId: string): Promise<VendorOrderStatusConfig>;
  /**
   * Replace the ordered list. Throws VALIDATION if a status key still used by
   * an existing order is removed, or if no cancelled status remains.
   */
  update(vendorOrgId: string, statuses: OrderStatus[]): Promise<VendorOrderStatusConfig>;
}
