import { OrdersList } from '@/features/orders/orders-list';

/** Vendor orders tab: incoming orders from every buyer. */
export function VendorOrdersScreen() {
  return <OrdersList side="VENDOR" />;
}
