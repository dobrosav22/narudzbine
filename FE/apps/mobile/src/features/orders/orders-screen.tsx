import { OrdersList } from './orders-list';

/** Buyer orders tab: this organization's orders with every vendor. */
export function OrdersScreen() {
  return <OrdersList side="BUYER" />;
}
