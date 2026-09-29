import type { OrdersService } from '../orders';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const ordersService: OrdersService = {
  listOrders: async () => notImplemented('orders.listOrders'),
  getOrder: async () => notImplemented('orders.getOrder'),
  createOrder: async () => notImplemented('orders.createOrder'),
  updateOrderStatus: async () => notImplemented('orders.updateOrderStatus'),
  listOrderMessages: async () => notImplemented('orders.listOrderMessages'),
  addOrderMessage: async () => notImplemented('orders.addOrderMessage'),
  reorder: async () => notImplemented('orders.reorder'),
};
