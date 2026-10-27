import { useLocalSearchParams } from 'expo-router';
import { ProductEditor } from '@/features/vendor-catalogue/product-editor';

export default function EditProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductEditor key={id} productId={id} />;
}
