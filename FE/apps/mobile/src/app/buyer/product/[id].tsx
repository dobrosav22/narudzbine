import { useLocalSearchParams } from 'expo-router';
import { ProductDetailScreen } from '@/features/buyer-catalogue/product-detail-screen';

export default function BuyerProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductDetailScreen productId={id} />;
}
