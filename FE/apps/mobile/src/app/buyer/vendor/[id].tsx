import { useLocalSearchParams } from 'expo-router';
import { BuyerVendorDetailScreen } from '@/features/trading/buyer-vendors-screen';

export default function BuyerVendor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BuyerVendorDetailScreen relationshipId={id} />;
}
