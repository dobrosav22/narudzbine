import { VendorStatsScreen } from '@/features/stats/vendor-stats-screen';
import { useSignedIn } from '@/lib/session';

export default function VendorStats() {
  const { membership } = useSignedIn();
  return <VendorStatsScreen vendorOrgId={membership.org.id} />;
}
