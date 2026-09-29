import { VendorCatalogueScreen } from '@/features/vendor-catalogue/vendor-catalogue-screen';
import { useSignedIn } from '@/lib/session';

export default function VendorCatalogue() {
  const { membership } = useSignedIn();
  return <VendorCatalogueScreen vendorOrgId={membership.org.id} />;
}
