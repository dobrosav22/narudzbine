import { LocationsScreen } from '@/features/org-admin/locations-screen';
import { useSignedIn } from '@/lib/session';

export default function Locations() {
  const { membership } = useSignedIn();
  return <LocationsScreen orgType={membership.orgType} orgId={membership.org.id} />;
}
