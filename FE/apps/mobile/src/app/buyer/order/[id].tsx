import { useLocalSearchParams } from 'expo-router';
import { OrderDetailScreen } from '@/features/orders/order-detail-screen';

export default function BuyerOrder() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  return <OrderDetailScreen orderId={id} placed={placed === '1'} />;
}
