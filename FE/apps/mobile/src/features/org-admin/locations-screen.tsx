import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  countMsg,
  emptyLocationDraft,
  isServiceError,
  LOCATION_COPY,
  validateLocationDraft,
  type Location,
  type LocationDraft,
  type OrgType,
  type VendorLocation,
  type Msg,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { FormError } from '@/components/ui/form-error';
import { SectionTitle } from '@/features/stats/parts';
import { useDeleteLocation, useLocations, useSaveLocation } from './queries';
import { useErrorText, useMsg, useT } from '@/lib/i18n';

type AnyLocation = Location | VendorLocation;

/** 03 → "Locations" on mobile: the list, an add/edit form card, delete with inline confirm. Mirrors web's LocationsPanel. */
export function LocationsScreen({ orgType, orgId }: { orgType: OrgType; orgId: string }) {
  const t = useT('settings.locations');
  const tmo = useT('m.locations');
  const tc = useT('common');
  const tm = useMsg();
  const copy = LOCATION_COPY[orgType];
  const org = { orgType, orgId };
  const locations = useLocations(org);
  const remove = useDeleteLocation(org);
  const [editing, setEditing] = useState<AnyLocation | 'new' | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (locations.isError) return <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />;
  if (locations.isPending) return <LoadingState label={tmo('loading')} />;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-4 pb-12" keyboardShouldPersistTaps="handled">
      {editing ? (
        <LocationForm
          key={editing === 'new' ? 'new' : editing.id}
          org={org}
          location={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : (
        <Button onPress={() => setEditing('new')}>{tm({ key: copy.add })}</Button>
      )}

      <View className="gap-3">
        <SectionTitle>{`${tm({ key: copy.title })} · ${tm(countMsg(copy.count, locations.data.length))}`}</SectionTitle>
        <FormError error={remove.error} />
        {locations.data.length === 0 ? (
          <EmptyState
            title={tm({ key: copy.none })}
            description={orgType === 'vendor' ? t('vendorEmpty') : t('buyerEmpty')}
          />
        ) : (
          <View className="overflow-hidden rounded-xl border border-border">
            {locations.data.map((l, i) => (
              <View key={l.id}>
                {i > 0 && <View className="h-px bg-border" />}
                <View className="gap-2 bg-background p-3">
                  <AppText weight="medium" className="text-base text-foreground">
                    {l.name}
                  </AppText>
                  <AppText className="text-sm text-muted-foreground">{l.address}</AppText>
                  {confirming === l.id ? (
                    <View className="gap-2" accessibilityRole="alert">
                      <AppText className="text-sm text-foreground">{tmo('deleteConfirm', { name: l.name })}</AppText>
                      <View className="flex-row gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onPress={() => setConfirming(null)}>
                          {t('keep')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1"
                          loading={remove.isPending}
                          onPress={() => remove.mutate(l.id, { onSettled: () => setConfirming(null) })}>
                          {tc('delete')}
                        </Button>
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row gap-2">
                      <Button size="sm" variant="outline" accessibilityLabel={tmo('editAria', { name: l.name })} onPress={() => setEditing(l)}>
                        {tc('edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        accessibilityLabel={tmo('deleteAria', { name: l.name })}
                        onPress={() => {
                          remove.reset();
                          setConfirming(l.id);
                        }}>
                        {tc('delete')}
                      </Button>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function LocationForm({
  org,
  location,
  onClose,
}: {
  org: { orgType: OrgType; orgId: string };
  location: AnyLocation | undefined;
  onClose: () => void;
}) {
  const t = useT('settings.locations');
  const tmo = useT('m.locations');
  const tc = useT('common');
  const tm = useMsg();
  const errorText = useErrorText();
  const copy = LOCATION_COPY[org.orgType];
  const [draft, setDraft] = useState<LocationDraft>(() => (location ? { name: location.name, address: location.address } : emptyLocationDraft()));
  const [attempted, setAttempted] = useState(false);
  const save = useSaveLocation(org);
  const { input, errors } = validateLocationDraft(draft);
  const shownMsg: Partial<Record<keyof LocationDraft, Msg>> = attempted ? errors : {};
  const shown = { name: shownMsg.name && tm(shownMsg.name), address: shownMsg.address && tm(shownMsg.address) };
  const set = (key: keyof LocationDraft) => (value: string) => {
    if (save.error) save.reset();
    setDraft((d) => ({ ...d, [key]: value }));
  };

  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-4">
      <AppText weight="semibold" className="text-lg text-card-foreground">
        {location ? t(org.orgType === 'vendor' ? 'editWarehouse' : 'editLocation') : tm({ key: copy.add })}
      </AppText>
      <FieldGroup>
        <Field label={t('name')}>
          <Input value={draft.name} onChangeText={set('name')} accessibilityLabel={tmo('nameAria')} />
          <FieldError>{shown.name}</FieldError>
        </Field>
        <Field label={t('address')}>
          <Input value={draft.address} onChangeText={set('address')} accessibilityLabel={t('address')} />
          <FieldError>{shown.address ?? (isServiceError(save.error, 'VALIDATION') ? errorText(save.error) : undefined)}</FieldError>
        </Field>
      </FieldGroup>
      {save.error && !isServiceError(save.error, 'VALIDATION') ? <FormError error={save.error} /> : null}
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={onClose}>
          {tc('cancel')}
        </Button>
        <Button
          className="flex-1"
          loading={save.isPending}
          onPress={() => {
            setAttempted(true);
            if (input) save.mutate({ locationId: location?.id, input }, { onSuccess: onClose });
          }}>
          {location ? tc('save') : tc('add')}
        </Button>
      </View>
    </View>
  );
}
