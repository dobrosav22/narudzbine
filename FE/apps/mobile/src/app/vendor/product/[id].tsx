import { useLocalSearchParams } from 'expo-router';
import { ProductEditor } from '@/features/vendor-catalogue/product-editor';
import { useSignedIn } from '@/lib/session';

export default function EditProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership } = useSignedIn();
  return <ProductEditor vendorOrgId={membership.org.id} productId={id} />;
}
