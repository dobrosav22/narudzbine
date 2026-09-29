import { ProductEditor } from '@/features/vendor-catalogue/product-editor';
import { useSignedIn } from '@/lib/session';

export default function NewProduct() {
  const { membership } = useSignedIn();
  return <ProductEditor vendorOrgId={membership.org.id} />;
}
