import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { formatDate, formatNumber, invitePath, isServiceError, removeMemberBlocker, USE_MOCKS, type Invite, type Membership } from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { FormError } from '@/components/ui/form-error';
import { SectionTitle } from '@/features/stats/parts';
import { useInviteTeammate, useRemoveMember, useRevokeInvite, useTeam } from './queries';
import { useErrorText, useMsg, useT } from '@/lib/i18n';

/** 03 → "Team" on mobile: members (remove with inline confirm), pending invites (withdraw), invite form. Mirrors web's TeamPanel. */
export function TeamScreen({ membership }: { membership: Membership }) {
  const t = useT('settings.team');
  const tmo = useT('m.team');
  const tm = useMsg();
  const team = useTeam(membership);
  const remove = useRemoveMember(membership);
  const revoke = useRevokeInvite(membership);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (team.isError) return <ErrorState error={team.error} onRetry={() => void team.refetch()} />;
  if (team.isPending) return <LoadingState label={tmo('loading')} />;
  const { members, pending } = team.data;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 p-4 pb-12" keyboardShouldPersistTaps="handled">
      <InviteForm membership={membership} />

      <View className="gap-3">
        <SectionTitle>{`${t('members')} · ${tmo('people', { count: members.length, countText: formatNumber(members.length) })}`}</SectionTitle>
        <AppText className="text-sm text-muted-foreground">{tmo('noRoles')}</AppText>
        <FormError error={remove.error} />
        <View className="overflow-hidden rounded-xl border border-border">
          {members.map((m, i) => {
            const blockerMsg = removeMemberBlocker(m, members.length);
            const blocker = blockerMsg && tm(blockerMsg);
            return (
              <View key={m.user.id}>
                {i > 0 && <View className="h-px bg-border" />}
                <View className="gap-1.5 bg-background p-3">
                  <View className="flex-row items-center gap-2">
                    <AppText weight="medium" className="text-base text-foreground" numberOfLines={1}>
                      {m.user.name}
                    </AppText>
                    {m.isYou && <Badge variant="secondary">{t('you')}</Badge>}
                  </View>
                  <AppText className="text-sm text-muted-foreground">
                    {[m.user.email, m.homeLocationName].filter(Boolean).join(' · ')}
                  </AppText>
                  {!blocker &&
                    (confirming === m.user.id ? (
                      <View className="gap-2" accessibilityRole="alert">
                        <AppText className="text-sm text-foreground">{tmo('removeConfirm', { name: m.user.name })}</AppText>
                        <View className="flex-row gap-2">
                          <Button size="sm" variant="outline" className="flex-1" onPress={() => setConfirming(null)}>
                            {t('keep')}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1"
                            loading={remove.isPending}
                            onPress={() => remove.mutate(m.user.id, { onSettled: () => setConfirming(null) })}>
                            {t('remove')}
                          </Button>
                        </View>
                      </View>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="self-start"
                        accessibilityLabel={t('removeAria', { name: m.user.name })}
                        onPress={() => {
                          remove.reset();
                          setConfirming(m.user.id);
                        }}>
                        {t('remove')}
                      </Button>
                    ))}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View className="gap-3">
        <SectionTitle>{t('pending')}</SectionTitle>
        <FormError error={revoke.error} />
        <View className="overflow-hidden rounded-xl border border-border">
          {pending.length === 0 ? (
            <AppText className="p-4 text-sm text-muted-foreground">{tmo('noPending')}</AppText>
          ) : (
            pending.map((inv, i) => (
              <View key={inv.id}>
                {i > 0 && <View className="h-px bg-border" />}
                <View className="gap-1.5 bg-background p-3">
                  <AppText mono className="text-sm text-foreground">
                    {inv.email}
                  </AppText>
                  <AppText className="text-xs text-muted-foreground">{t('sent', { date: formatDate(inv.sentAt) })}</AppText>
                  {USE_MOCKS && <InviteLinkText invite={inv} />}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="self-start"
                    accessibilityLabel={t('withdrawAria', { email: inv.email })}
                    loading={revoke.isPending && revoke.variables === inv.id}
                    onPress={() => revoke.mutate(inv.id)}>
                    {t('withdraw')}
                  </Button>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function InviteForm({ membership }: { membership: Membership }) {
  const t = useT('settings.team');
  const tmo = useT('m.team');
  const errorText = useErrorText();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<Invite>();
  const invite = useInviteTeammate(membership);
  const fieldError = isServiceError(invite.error, 'VALIDATION') || isServiceError(invite.error, 'CONFLICT') ? errorText(invite.error) : undefined;

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <Field label={tmo('inviteLabel')}>
        <Input
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setSent(undefined);
            if (invite.error) invite.reset();
          }}
          placeholder="name@company.ba"
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel={tmo('emailAria')}
        />
        <FieldError>{fieldError}</FieldError>
      </Field>
      {invite.error && !fieldError ? <FormError error={invite.error} /> : null}
      <Button
        loading={invite.isPending}
        disabled={!email}
        onPress={() =>
          invite.mutate(email, {
            onSuccess: (i) => {
              setSent(i);
              setEmail('');
            },
          })
        }>
        {t('send')}
      </Button>
      {sent && (
        <View accessibilityRole="alert" className="gap-1">
          <AppText className="text-sm text-success">{t('sentDescription', { email: sent.email, org: membership.org.name })}</AppText>
          {USE_MOCKS && <InviteLinkText invite={sent} />}
        </View>
      )}
    </View>
  );
}

/** [assumed] Mock-only: no email is sent, so show the path that would be emailed. */
function InviteLinkText({ invite }: { invite: Pick<Invite, 'token'> }) {
  const tmo = useT('m.buyers');
  return (
    <AppText mono selectable className="text-xs text-muted-foreground">
      {tmo('inviteLink', { path: invitePath(invite) })}
    </AppText>
  );
}
