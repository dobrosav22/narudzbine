import { BuyerOrderActions } from './buyer-actions';
import { OrderDetailLoader } from './order-detail';

/** Buyer order detail on mobile (mirrors web). `placed` after a successful checkout. */
export function OrderDetailScreen({ orderId, placed }: { orderId: string; placed: boolean }) {
  return <OrderDetailLoader orderId={orderId} placed={placed} actions={(order, viewer) => <BuyerOrderActions order={order} viewer={viewer} />} />;
}
