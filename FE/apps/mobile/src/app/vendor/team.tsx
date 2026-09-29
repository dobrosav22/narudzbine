import { TeamScreen } from '@/features/org-admin/team-screen';
import { useSignedIn } from '@/lib/session';

export default function Team() {
  const { membership } = useSignedIn();
  return <TeamScreen membership={membership} />;
}
