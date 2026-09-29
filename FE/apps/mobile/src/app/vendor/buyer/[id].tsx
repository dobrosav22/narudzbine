import { useLocalSearchParams } from 'expo-router';
import { BuyerDetailScreen } from '@/features/vendor-orders/buyer-detail-screen';
import { useSignedIn } from '@/lib/session';

export default function VendorBuyer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership } = useSignedIn();
  return <BuyerDetailScreen vendorOrgId={membership.org.id} buyerOrgId={id} />;
}
