import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  formatDate,
  isServiceError,
  NOTIFICATION_CHANNELS,
  notificationRows,
  passwordProblems,
  type Membership,
  type OrgType,
  type PasswordDraft,
  type Msg,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { FormError } from '@/components/ui/form-error';
import { SwitchRow } from '@/components/ui/switch-row';
import { SectionTitle } from '@/features/stats/parts';
import { useVendorOrg } from '@/features/vendor-catalogue/queries';
import {
  useBuyerOrg,
  useChangePassword,
  useLocations,
  useNotificationPrefs,
  useSetHomeLocation,
  useTogglePreference,
  useUpdateCompany,
  useUpdateProfile,
} from './queries';
import { useErrorText, useMsg, useT } from '@/lib/i18n';

// ── Company ──────────────────────────────────────────────────────────────

/** Company name (both sides) and inventory tracking (vendors). Mirrors web's CompanyPanel. */
export function CompanyScreen({ orgType, orgId }: { orgType: OrgType; orgId: string }) {
  return orgType === 'vendor' ? <VendorCompany orgId={orgId} /> : <BuyerCompany orgId={orgId} />;
}

function VendorCompany({ orgId }: { orgId: string }) {
  const org = useVendorOrg(orgId);
  if (org.isError) return <ErrorState error={org.error} onRetry={() => void org.refetch()} />;
  if (org.isPending) return <LoadingState />;
  return (
    <Screen>
      <NameForm orgType="vendor" orgId={orgId} name={org.data.name} createdAt={org.data.createdAt} />
      <InventorySection orgId={orgId} tracksInventory={org.data.tracksInventory} />
    </Screen>
  );
}

function BuyerCompany({ orgId }: { orgId: string }) {
  const org = useBuyerOrg(orgId);
  if (org.isError) return <ErrorState error={org.error} onRetry={() => void org.refetch()} />;
  if (org.isPending) return <LoadingState />;
  return (
    <Screen>
      <NameForm orgType="buyer" orgId={orgId} name={org.data.name} createdAt={org.data.createdAt} />
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 p-4 pb-12" keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

function NameForm({ orgType, orgId, name, createdAt }: { orgType: OrgType; orgId: string; name: string; createdAt: string }) {
  const t = useT('settings.company');
  const tmo = useT('m.company');
  const tc = useT('common');
  const errorText = useErrorText();
  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(false);
  const update = useUpdateCompany({ orgType, orgId });
  const error = isServiceError(update.error, 'VALIDATION') ? errorText(update.error) : !value.trim() ? t('nameRequired') : undefined;

  return (
    <View className="gap-3">
      <Field
        label={t('name')}
        description={`${orgType === 'vendor' ? tmo('vendorNote') : tmo('buyerNote')} ${t('since', { date: formatDate(createdAt) })}`}>
        <Input
          value={value}
          accessibilityLabel={t('name')}
          onChangeText={(v) => {
            setSaved(false);
            if (update.error) update.reset();
            setValue(v);
          }}
        />
        <FieldError>{error}</FieldError>
      </Field>
      {update.error && !isServiceError(update.error, 'VALIDATION') ? <FormError error={update.error} /> : null}
      {saved && (
        <AppText accessibilityRole="alert" className="text-sm text-success">
          {tmo('saved')}
        </AppText>
      )}
      <Button
        loading={update.isPending}
        disabled={value.trim() === name || !value.trim()}
        onPress={() => update.mutate({ name: value }, { onSuccess: () => setSaved(true) })}>
        {tc('save')}
      </Button>
    </View>
  );
}

function InventorySection({ orgId, tracksInventory }: { orgId: string; tracksInventory: boolean }) {
  const t = useT('settings.inventory');
  const tmo = useT('m.company');
  const update = useUpdateCompany({ orgType: 'vendor', orgId });
  const [confirmOff, setConfirmOff] = useState(false);
  return (
    <View className="gap-3">
      <SectionTitle>{t('title')}</SectionTitle>
      <SwitchRow
        label={t('track')}
        description={tmo('trackDescription')}
        value={tracksInventory}
        disabled={update.isPending}
        // Turning it off drops every stock number, so that direction asks first (as on web).
        onValueChange={(on) => (on ? update.mutate({ tracksInventory: true }) : setConfirmOff(true))}
      />
      {confirmOff && (
        <View className="gap-2 rounded-lg border border-border p-3" accessibilityRole="alert">
          <AppText className="text-sm text-foreground">
            {tmo('stopConfirm')}
          </AppText>
          <View className="flex-row gap-2">
            <Button size="sm" variant="outline" className="flex-1" onPress={() => setConfirmOff(false)}>
              {t('keep')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              loading={update.isPending}
              onPress={() => update.mutate({ tracksInventory: false }, { onSettled: () => setConfirmOff(false) })}>
              {t('stop')}
            </Button>
          </View>
        </View>
      )}
      <FormError error={update.error} />
    </View>
  );
}

// ── Profile ──────────────────────────────────────────────────────────────

/** Account profile: name, read-only email, home location, password. Mirrors web's ProfilePanel. */
export function ProfileScreen({ membership, email }: { membership: Membership; email: string }) {
  return (
    <Screen>
      <DetailsForm membership={membership} email={email} />
      <HomeLocation membership={membership} />
      <PasswordForm email={email} />
    </Screen>
  );
}

function DetailsForm({ membership, email }: { membership: Membership; email: string }) {
  const t = useT('account.profile');
  const ta = useT('auth');
  const tmo = useT('m.profile');
  const errorText = useErrorText();
  const [name, setName] = useState(membership.user.name);
  const [saved, setSaved] = useState(false);
  const update = useUpdateProfile(email);
  const error = isServiceError(update.error, 'VALIDATION') ? errorText(update.error) : !name.trim() ? t('nameRequired') : undefined;

  return (
    <View className="gap-4">
      <FieldGroup>
        <Field label={t('name')} description={t('nameHint')}>
          <Input
            value={name}
            accessibilityLabel={ta('yourName')}
            autoComplete="name"
            onChangeText={(v) => {
              setSaved(false);
              if (update.error) update.reset();
              setName(v);
            }}
          />
          <FieldError>{error}</FieldError>
        </Field>
        <Field label={t('email')} description={t('emailHint')}>
          <Input value={email} editable={false} accessibilityLabel={t('email')} />
        </Field>
      </FieldGroup>
      {update.error && !isServiceError(update.error, 'VALIDATION') ? <FormError error={update.error} /> : null}
      {saved && (
        <AppText accessibilityRole="alert" className="text-sm text-success">
          {tmo('saved')}
        </AppText>
      )}
      <Button
        loading={update.isPending}
        disabled={name.trim() === membership.user.name || !name.trim()}
        onPress={() => update.mutate(name, { onSuccess: () => setSaved(true) })}>
        {t('save')}
      </Button>
    </View>
  );
}

function HomeLocation({ membership }: { membership: Membership }) {
  const t = useT('account.profile');
  const tpe = useT('productEditor');
  const locations = useLocations({ orgType: membership.orgType, orgId: membership.org.id });
  const home = useSetHomeLocation(membership);
  const current = membership.user.homeLocationId;
  return (
    <View className="gap-2">
      <SectionTitle>{t('home', { org: membership.org.name })}</SectionTitle>
      <AppText className="text-sm text-muted-foreground">
        {membership.orgType === 'buyer' ? t('homeBuyerHint') : t('homeVendorHint')}
      </AppText>
      <View className="flex-row flex-wrap gap-2">
        <Chip role="radio" label={tpe('none')} selected={!current} onPress={() => home.mutate(null)} />
        {locations.data?.map((l) => (
          <Chip key={l.id} role="radio" label={l.name} selected={current === l.id} onPress={() => home.mutate(l.id)} />
        ))}
      </View>
      <FormError error={home.error ?? locations.error} />
    </View>
  );
}

const EMPTY_PASSWORDS: PasswordDraft = { current: '', next: '', confirm: '' };

function PasswordForm({ email }: { email: string }) {
  const t = useT('account.password');
  const tmo = useT('m.profile');
  const tm = useMsg();
  const errorText = useErrorText();
  const [draft, setDraft] = useState(EMPTY_PASSWORDS);
  const [attempted, setAttempted] = useState(false);
  const [done, setDone] = useState(false);
  const change = useChangePassword(email);
  const problems = passwordProblems(draft);
  const shownMsg: Partial<Record<keyof PasswordDraft, Msg>> = attempted ? problems : {};
  const shown = { current: shownMsg.current && tm(shownMsg.current), next: shownMsg.next && tm(shownMsg.next), confirm: shownMsg.confirm && tm(shownMsg.confirm) };
  const currentError = shown.current ?? (isServiceError(change.error, 'UNAUTHORIZED') ? errorText(change.error) : undefined);
  const set = (key: keyof PasswordDraft) => (v: string) => {
    setDone(false);
    if (change.error) change.reset();
    setDraft((d) => ({ ...d, [key]: v }));
  };

  return (
    <View className="gap-4">
      <SectionTitle>{t('title')}</SectionTitle>
      <FieldGroup>
        <Field label={t('current')}>
          <Input secureTextEntry value={draft.current} onChangeText={set('current')} accessibilityLabel={t('current')} autoComplete="current-password" />
          <FieldError>{currentError}</FieldError>
        </Field>
        <Field label={t('new')}>
          <Input secureTextEntry value={draft.next} onChangeText={set('next')} accessibilityLabel={t('new')} autoComplete="new-password" />
          <FieldError>{shown.next}</FieldError>
        </Field>
        <Field label={t('confirm')}>
          <Input secureTextEntry value={draft.confirm} onChangeText={set('confirm')} accessibilityLabel={t('confirm')} autoComplete="new-password" />
          <FieldError>{shown.confirm}</FieldError>
        </Field>
      </FieldGroup>
      {change.error && !isServiceError(change.error, 'UNAUTHORIZED') ? <FormError error={change.error} /> : null}
      {done && (
        <AppText accessibilityRole="alert" className="text-sm text-success">
          {tmo('passwordChanged')}
        </AppText>
      )}
      <Button
        variant="outline"
        loading={change.isPending}
        disabled={!draft.current}
        onPress={() => {
          setAttempted(true);
          if (Object.keys(problems).length) return;
          change.mutate(
            { currentPassword: draft.current, newPassword: draft.next },
            {
              onSuccess: () => {
                setDraft(EMPTY_PASSWORDS);
                setAttempted(false);
                setDone(true);
              },
            },
          );
        }}>
        {t('submit')}
      </Button>
    </View>
  );
}

// ── Notifications ────────────────────────────────────────────────────────

/** 03 → "Notification settings": one block per event with Push and Email switches. Mirrors web's matrix. */
export function NotificationsScreen({ membership }: { membership: Membership }) {
  return membership.orgType === 'vendor' ? <VendorNotifications membership={membership} /> : <NotificationList membership={membership} />;
}

function VendorNotifications({ membership }: { membership: Membership }) {
  const vendor = useVendorOrg(membership.org.id);
  return <NotificationList membership={membership} tracksInventory={vendor.data?.tracksInventory} />;
}

function NotificationList({ membership, tracksInventory }: { membership: Membership; tracksInventory?: boolean }) {
  const t = useT('account.notifications');
  const tm = useMsg();
  const prefs = useNotificationPrefs(membership);
  const toggle = useTogglePreference(membership);
  if (prefs.isError) return <ErrorState error={prefs.error} onRetry={() => void prefs.refetch()} />;
  if (prefs.isPending) return <LoadingState />;
  const rows = notificationRows(prefs.data, membership.orgType, { tracksInventory });

  return (
    <Screen>
      <AppText className="text-sm text-muted-foreground">{t('description')}</AppText>
      <FormError error={toggle.error} />
      {rows.map((r) => (
        <View key={r.type} className="gap-3 rounded-xl border border-border p-4">
          <View className="gap-0.5">
            <AppText weight="medium" className="text-base text-foreground">
              {tm({ key: r.labelKey })}
            </AppText>
            <AppText className="text-sm text-muted-foreground">{tm({ key: r.unavailableKey ?? r.descriptionKey })}</AppText>
          </View>
          {NOTIFICATION_CHANNELS.map((c) => (
            <SwitchRow
              key={c.value}
              label={tm({ key: c.labelKey })}
              accessibilityLabel={t('switchAria', { label: tm({ key: r.labelKey }), channel: tm({ key: `channelsBy.${c.value}` }) })}
              value={r.enabled[c.value] && !r.unavailableKey}
              disabled={!!r.unavailableKey}
              onValueChange={(enabled) => toggle.mutate({ notificationType: r.type, channel: c.value, enabled })}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}
