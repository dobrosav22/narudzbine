import { NotificationsScreen } from '@/features/org-admin/settings-screens';
import { useSignedIn } from '@/lib/session';

export default function Notifications() {
  const { membership } = useSignedIn();
  return <NotificationsScreen membership={membership} />;
}
