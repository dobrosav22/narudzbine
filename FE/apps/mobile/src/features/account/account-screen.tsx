import { Children } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Bell, Building2, Check, ChevronRight, CreditCard, Languages, MapPin, Store, UserRound, UsersRound } from 'lucide-react-native';
import { SUPPORTED_LOCALES, USE_MOCKS } from '@repo/core';
import { AppText } from '@/components/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { initials, sessionStore, useSignedIn } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { changeLocale, useErrorText, useT, useUiLocale } from '@/lib/i18n';

/**
 * Account tab (both roles): who you are, org switcher (only for logins with
 * several memberships), vendor switcher (buyers with 2+ vendors), log out.
 * Theme follows the OS on mobile.
 */
export function AccountScreen() {
  const c = useTokenColors();
  const t = useT('m.account');
  const tc = useT('common');
  const errorText = useErrorText();
  const locale = useUiLocale();
  const { session, membership, connectedVendors, activeVendor } = useSignedIn();

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 p-4 pb-12">
      <View className="flex-row items-center gap-3">
        <View className="size-12 items-center justify-center rounded-lg bg-muted">
          <AppText weight="medium" className="text-base text-foreground">
            {initials(membership.user.name)}
          </AppText>
        </View>
        <View className="flex-1 gap-0.5">
          <AppText weight="semibold" className="text-lg text-foreground">
            {membership.user.name}
          </AppText>
          <AppText className="text-sm text-muted-foreground">{session.email}</AppText>
        </View>
        {USE_MOCKS && <Badge>{tc('mockData')}</Badge>}
      </View>

      {session.memberships.length > 1 && (
        <Section title={t('organizations')}>
          {session.memberships.map((m) => (
            <OptionRow
              key={m.org.id}
              icon={<Building2 size={18} color={c['muted-foreground']} />}
              title={m.org.name}
              subtitle={m.orgType === 'vendor' ? t('vendor') : t('buyer')}
              selected={m.org.id === membership.org.id}
              // The role guard flips and `index` routes to the new shell.
              onPress={() => void sessionStore.selectMembership(m.org.id).then(() => router.replace('/'))}
            />
          ))}
        </Section>
      )}

      {membership.orgType === 'buyer' && connectedVendors.length > 1 && (
        <Section title={t('orderingFrom')}>
          {connectedVendors.map((v) => (
            <OptionRow
              key={v.id}
              icon={<Store size={18} color={c['muted-foreground']} />}
              title={v.name}
              selected={v.id === activeVendor?.id}
              onPress={() => void sessionStore.selectVendor(v.id)}
            />
          ))}
        </Section>
      )}

      {session.memberships.length === 1 && (
        <Section title={t('organization')}>
          <OptionRow icon={<Building2 size={18} color={c['muted-foreground']} />} title={membership.org.name} subtitle={membership.orgType === 'vendor' ? t('vendor') : t('buyer')} />
        </Section>
      )}

      <Section title={t('yourAccount')}>
        <NavRow icon={<UserRound size={18} color={c['muted-foreground']} />} title={t('profile')} subtitle={t('profileHint')} href={`/${membership.orgType}/profile`} />
        <NavRow icon={<Bell size={18} color={c['muted-foreground']} />} title={t('notifications')} subtitle={t('notificationsHint')} href={`/${membership.orgType}/notifications`} />
      </Section>

      {/* 01 §12: the interface language is per login; names, products and messages are never translated. */}
      <Section title={tc('language')}>
        {SUPPORTED_LOCALES.map((l) => (
          <OptionRow
            key={l.value}
            icon={<Languages size={18} color={c['muted-foreground']} />}
            title={l.label}
            selected={l.value === locale}
            onPress={() => void changeLocale(l.value).catch((e: unknown) => Alert.alert(errorText(e)))}
          />
        ))}
      </Section>

      {/* Company admin (03 → Locations, Team, Subscription). Order statuses stay web-only, like bulk edit. */}
      <Section title={membership.org.name}>
        <NavRow icon={<Building2 size={18} color={c['muted-foreground']} />} title={t('company')} subtitle={membership.orgType === 'vendor' ? t('companyHintVendor') : t('companyHintBuyer')} href={`/${membership.orgType}/company`} />
        <NavRow
          icon={<MapPin size={18} color={c['muted-foreground']} />}
          title={membership.orgType === 'vendor' ? t('warehouses') : t('deliveryLocations')}
          href={`/${membership.orgType}/locations`}
        />
        <NavRow icon={<UsersRound size={18} color={c['muted-foreground']} />} title={t('team')} subtitle={t('teamHint')} href={`/${membership.orgType}/team`} />
        {membership.orgType === 'vendor' && (
          <NavRow icon={<CreditCard size={18} color={c['muted-foreground']} />} title={t('plan')} subtitle={t('planHint')} href="/vendor/plan" />
        )}
      </Section>

      <Button variant="destructive" onPress={() => void sessionStore.signOut()}>
        {t('logOut')}
      </Button>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <AppText weight="medium" className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </AppText>
      {/* Rows are separated by explicit dividers (no reliance on last: variants on native). */}
      <View className="overflow-hidden rounded-lg border border-border">
        {Children.toArray(children).map((child, i) => (
          <View key={i}>
            {i > 0 && <View className="h-px bg-border" />}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

function NavRow({
  icon,
  title,
  subtitle,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  href: Href;
}) {
  const c = useTokenColors();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(href)} className="flex-row items-center gap-3 bg-background p-3 active:bg-muted">
      {icon}
      <View className="flex-1 gap-0.5">
        <AppText weight="medium" className="text-base text-foreground">
          {title}
        </AppText>
        {subtitle && <AppText className="text-xs text-muted-foreground">{subtitle}</AppText>}
      </View>
      <ChevronRight size={18} color={c['muted-foreground']} />
    </Pressable>
  );
}

export function OptionRow({
  icon,
  title,
  subtitle,
  selected,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const c = useTokenColors();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'radio' : undefined}
      aria-checked={onPress ? !!selected : undefined}
      className={`flex-row items-center gap-3 p-3 ${
        selected ? 'bg-primary-subtle' : 'bg-background active:bg-muted'
      }`}>
      {icon}
      <View className="flex-1 gap-0.5">
        <AppText weight="medium" className={`text-base ${selected ? 'text-primary-subtle-foreground' : 'text-foreground'}`}>
          {title}
        </AppText>
        {subtitle && <AppText className="text-xs text-muted-foreground">{subtitle}</AppText>}
      </View>
      {selected && <Check size={18} color={c['primary-subtle-foreground']} />}
    </Pressable>
  );
}
