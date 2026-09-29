import { DashboardScreen } from '@/features/vendor-dashboard/dashboard-screen';
import { useSignedIn } from '@/lib/session';

export default function VendorDashboard() {
  const { membership } = useSignedIn();
  return <DashboardScreen vendorOrgId={membership.org.id} />;
}
