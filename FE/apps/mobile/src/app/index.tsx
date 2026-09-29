import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/ui/button';
import { sessionStore, useSession } from '@/lib/session';
import { useT } from '@/lib/i18n';

/** Anchor route: send people to login or to their role's home. */
export default function Index() {
  const state = useSession();
  if (state.status === 'signedIn') {
    return <Redirect href={state.membership.orgType === 'vendor' ? '/vendor' : '/buyer'} />;
  }
  if (state.status === 'signedOut') return <Redirect href="/login" />;
  // v1.1: the Platform Admin panel lives only in the web app (02 "Admin panel").
  if (state.status === 'admin') return <AdminOnWeb name={state.admin.name} />;
  return null; // splash is still up while loading
}

function AdminOnWeb({ name }: { name: string }) {
  const t = useT('m.adminOnWeb');
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-8">
      <AppText weight="semibold" className="text-center text-xl text-foreground">
        {t('hi', { name })}
      </AppText>
      <AppText className="text-center text-base text-muted-foreground">
        {t('body')}
      </AppText>
      <Button variant="outline" onPress={() => void sessionStore.signOut()}>
        {t('logOut')}
      </Button>
    </View>
  );
}
