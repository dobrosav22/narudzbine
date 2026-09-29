import { useLocalSearchParams } from 'expo-router';
import { VendorOrderDetailScreen } from '@/features/vendor-orders/order-detail-screen';
import { useSignedIn } from '@/lib/session';

export default function VendorOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership } = useSignedIn();
  return <VendorOrderDetailScreen vendorOrgId={membership.org.id} orderId={id} />;
}
