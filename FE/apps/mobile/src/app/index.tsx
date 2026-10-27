import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { AppText } from '@/components/app-text';
import { ErrorState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { sessionStore, useSession } from '@/lib/session';
import { useT } from '@/lib/i18n';

/** Anchor route: send people to login or to their organization's home. */
export default function Index() {
  const state = useSession();
  if (state.status === 'business') return <Redirect href={state.organization.type === 'VENDOR' ? '/vendor' : '/buyer'} />;
  if (state.status === 'signedOut') return <Redirect href="/login" />;
  // Platform administration lives only in the web app.
  if (state.status === 'admin') return <AdminOnWeb name={state.account.displayName} />;
  // The stored session couldn't be checked (rate limit, outage, offline); nothing was signed out.
  if (state.status === 'unavailable') return <ErrorState error={state.error} onRetry={() => void sessionStore.retry()} />;
  return null; // the splash is still up while loading
}

function AdminOnWeb({ name }: { name: string }) {
  const t = useT('mAdminOnWeb');
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-8">
      <AppText weight="semibold" className="text-center text-xl text-foreground">
        {t('hi', { name })}
      </AppText>
      <AppText className="text-center text-base text-muted-foreground">{t('body')}</AppText>
      <Button variant="outline" onPress={() => void sessionStore.logout()}>
        {t('logOut')}
      </Button>
    </View>
  );
}
