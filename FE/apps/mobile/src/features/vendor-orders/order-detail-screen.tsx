import { OrderDetailLoader } from '@/features/orders/order-detail';
import { VendorOrderActions } from './vendor-actions';

/** Vendor order detail on mobile (mirrors web). */
export function VendorOrderDetailScreen({ orderId }: { orderId: string }) {
  return <OrderDetailLoader orderId={orderId} actions={(order, viewer) => <VendorOrderActions order={order} role={viewer.role} />} />;
}
