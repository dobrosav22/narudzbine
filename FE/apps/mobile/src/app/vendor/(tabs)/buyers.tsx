import { BuyersScreen } from '@/features/vendor-orders/buyers-screen';
import { useSignedIn } from '@/lib/session';

export default function VendorBuyers() {
  const { membership } = useSignedIn();
  return <BuyersScreen vendorOrgId={membership.org.id} />;
}
