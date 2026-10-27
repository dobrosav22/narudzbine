import { useLocalSearchParams } from 'expo-router';
import { VendorOrderDetailScreen } from '@/features/vendor-orders/order-detail-screen';

export default function VendorOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VendorOrderDetailScreen orderId={id} />;
}
