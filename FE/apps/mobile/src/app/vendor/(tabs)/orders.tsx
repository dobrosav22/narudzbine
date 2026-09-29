import { VendorOrdersScreen } from '@/features/vendor-orders/orders-screen';
import { useSignedIn } from '@/lib/session';

export default function VendorOrders() {
  const { membership } = useSignedIn();
  return <VendorOrdersScreen vendorOrgId={membership.org.id} />;
}
