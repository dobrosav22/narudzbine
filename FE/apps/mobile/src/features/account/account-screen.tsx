import { ScrollView, View } from 'react-native';
import { Bell, Building2, ClipboardList, CreditCard, FilePenLine, Inbox, MapPin, ShieldCheck, Truck, UserRound, UsersRound } from 'lucide-react-native';
import { unreadBadge } from '@repo/core';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/ui/button';
import { initials, sessionStore, useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { useT } from '@/lib/i18n';
import { useUnreadNotifications } from './queries';
import { NavRow, Section } from './rows';

/**
 * Account tab (vendor and buyer): who you are, your account screens, the inbox, the
 * organization's screens and sign out. There's no organization switching.
 */
export function AccountScreen() {
  const c = useTokenColors();
  const t = useT('shell');
  const tm = useT('shell.screens');
  const { account, organization } = useBusiness();
  const unread = useUnreadNotifications();
  const side = organization.type === 'VENDOR' ? 'vendor' : 'buyer';
  const icon = (I: typeof Bell) => <I size={18} color={c['muted-foreground']} />;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 p-4 pb-12">
      <View className="flex-row items-center gap-3">
        <View className="size-12 items-center justify-center rounded-lg bg-muted">
          <AppText weight="medium" className="text-base text-foreground">
            {initials(account.displayName)}
          </AppText>
        </View>
        <View className="flex-1 gap-0.5">
          <AppText weight="semibold" className="text-lg text-foreground">
            {account.displayName}
          </AppText>
          <AppText className="text-sm text-muted-foreground">{account.email}</AppText>
          {account.role && <AppText className="text-xs text-muted-foreground">{t(`roles.${account.role}`)}</AppText>}
        </View>
      </View>

      <Section title={t('yourAccount')}>
        <NavRow icon={icon(Inbox)} title={tm('inbox')} href={`/${side}/inbox`} badge={unread.data ? unreadBadge(unread.data.count, unread.data.more) : null} />
        <NavRow icon={icon(UserRound)} title={tm('profile')} subtitle={t('profileHint')} href={`/${side}/profile`} />
        <NavRow icon={icon(ShieldCheck)} title={tm('security')} subtitle={t('securityHint')} href={`/${side}/security`} />
        <NavRow icon={icon(Bell)} title={tm('notificationSettings')} href={`/${side}/notifications`} />
      </Section>

      <Section title={organization.displayName}>
        <NavRow icon={icon(Building2)} title={tm('company')} subtitle={t('companyHint')} href={`/${side}/company`} />
        <NavRow icon={icon(UsersRound)} title={tm('team')} href={`/${side}/team`} />
        <NavRow icon={icon(MapPin)} title={side === 'vendor' ? tm('vendorLocations') : tm('buyerLocations')} href={`/${side}/locations`} />
        {side === 'vendor' ? (
          <>
            <NavRow icon={icon(ClipboardList)} title={tm('stages')} href="/vendor/stages" />
            <NavRow icon={icon(CreditCard)} title={tm('plan')} href="/vendor/plan" />
          </>
        ) : (
          <>
            <NavRow icon={icon(FilePenLine)} title={tm('drafts')} href="/buyer/drafts" />
            <NavRow icon={icon(Truck)} title={tm('vendors')} href="/buyer/vendors" />
          </>
        )}
      </Section>

      <Button variant="destructive" onPress={() => void sessionStore.logout()}>
        {t('logOut')}
      </Button>
    </ScrollView>
  );
}
