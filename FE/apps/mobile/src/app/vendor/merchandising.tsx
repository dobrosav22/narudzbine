import { MerchandisingScreen } from '@/features/merchandising/merchandising-screen';
import { useSignedIn } from '@/lib/session';

export default function VendorMerchandising() {
  const { membership } = useSignedIn();
  return <MerchandisingScreen vendorOrgId={membership.org.id} />;
}
