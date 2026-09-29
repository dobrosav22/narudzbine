import { CompanyScreen } from '@/features/org-admin/settings-screens';
import { useSignedIn } from '@/lib/session';

export default function Company() {
  const { membership } = useSignedIn();
  return <CompanyScreen orgType={membership.orgType} orgId={membership.org.id} />;
}
