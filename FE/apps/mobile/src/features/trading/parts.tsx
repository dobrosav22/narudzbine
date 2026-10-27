import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { isApiError, type Partner, type Relationship } from '@repo/core';
import { AppText } from '@/components/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { useT } from '@/lib/i18n';
import { useDisconnect, usePartner } from './queries';

export function RelationshipStateBadge({ state }: { state: Relationship['state'] }) {
  const t = useT('trdCommon.state');
  return state === 'ACTIVE' ? <Badge variant="success">{t('ACTIVE')}</Badge> : <Badge variant="secondary">{t('DISCONNECTED')}</Badge>;
}

/** The counterparty's display name, loaded per row (no batch partner endpoint). */
export function usePartnerName(organizationId: string | undefined): string | undefined {
  const t = useT('trdCommon');
  const partner = usePartner(organizationId);
  if (partner.isPending) return undefined;
  if (partner.isError) return isApiError(partner.error, 'NOT_FOUND') ? t('formerPartner') : t('partnerUnavailable');
  return partner.data.displayName;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="flex-row justify-between gap-3">
      <AppText className="text-sm text-muted-foreground">{label}</AppText>
      <AppText mono={mono} selectable className="flex-1 text-right text-sm text-foreground">
        {value}
      </AppText>
    </View>
  );
}

/** Identity fields and the explicitly shared business contact. */
export function PartnerDetails({ partner }: { partner: Partner }) {
  const t = useT('trdCommon.partner');
  const contact = partner.businessContact;
  return (
    <Card>
      <CardHeader title={t('title')} description={partner.relationshipState === 'DISCONNECTED' ? t('frozen') : undefined} />
      <View className="gap-2">
        <Row label={t('legalName')} value={partner.legalName} />
        <Row label={t('registration')} value={partner.registrationIdentifier} mono />
        <Row label={t('tax')} value={partner.taxIdentifier ?? '—'} mono />
      </View>
      <View className="gap-1">
        <AppText className="text-sm text-muted-foreground">{t('contact')}</AppText>
        {contact ? (
          <>
            <AppText weight="medium" className="text-sm text-foreground">
              {contact.name}
            </AppText>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${contact.phone.replace(/[^+0-9]/g, '')}`)}>
              <AppText className="text-sm text-primary">{contact.phone}</AppText>
            </Pressable>
            {contact.email && (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${contact.email}`)}>
                <AppText className="text-sm text-primary">{contact.email}</AppText>
              </Pressable>
            )}
          </>
        ) : (
          <AppText className="text-sm text-foreground">{t('noContact', { name: partner.displayName })}</AppText>
        )}
      </View>
    </Card>
  );
}

/** Owner/admin of either party: reason (shared with the partner) + current revision. */
export function DisconnectPanel({
  relationship,
  partnerName,
  onDisconnected,
}: {
  relationship: Relationship;
  partnerName: string;
  onDisconnected?: (relationship: Relationship) => void;
}) {
  const t = useT('trdCommon.disconnect');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const disconnect = useDisconnect();
  if (!open) {
    return (
      <Button variant="destructive" onPress={() => setOpen(true)}>
        {t('action')}
      </Button>
    );
  }
  return (
    <View accessibilityRole="alert" className="gap-3 rounded-lg border border-border bg-card p-4">
      <AppText weight="medium" className="text-sm text-foreground">
        {t('title', { name: partnerName })}
      </AppText>
      <AppText className="text-sm text-muted-foreground">{t('description')}</AppText>
      <Field label={t('reason')} description={t('reasonHint', { name: partnerName })}>
        <Input value={reason} onChangeText={setReason} multiline maxLength={1000} className="h-20 py-2" accessibilityLabel={t('reason')} />
      </Field>
      <FormError error={disconnect.error} />
      <View className="flex-row gap-2">
        <Button size="sm" variant="outline" onPress={() => (setOpen(false), disconnect.reset())}>
          {t('keep')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={!reason.trim()}
          loading={disconnect.isPending}
          onPress={() =>
            disconnect.mutate(
              { relationshipId: relationship.id, expectedRevision: relationship.revision, reason: reason.trim() },
              {
                onSuccess: (updated) => {
                  setOpen(false);
                  setReason('');
                  onDisconnected?.(updated);
                },
              },
            )
          }>
          {t('confirm')}
        </Button>
      </View>
    </View>
  );
}
