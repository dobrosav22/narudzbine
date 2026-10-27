import { useLocalSearchParams } from 'expo-router';
import { VendorBuyerDetailScreen } from '@/features/trading/vendor-buyer-detail-screen';

export default function VendorBuyer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VendorBuyerDetailScreen relationshipId={id} />;
}
