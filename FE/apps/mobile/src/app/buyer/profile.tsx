import { ProfileScreen } from '@/features/org-admin/settings-screens';
import { useSignedIn } from '@/lib/session';

export default function Profile() {
  const { membership, session } = useSignedIn();
  return <ProfileScreen membership={membership} email={session.email} />;
}
