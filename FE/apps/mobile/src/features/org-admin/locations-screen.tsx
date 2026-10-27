import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { ChevronRight, MapPin } from 'lucide-react-native';
import {
  addressProblems,
  canManageOrganization,
  cleanAddress,
  contactDraftFrom,
  contactFromDraft,
  contactProblems,
  emptyAddress,
  formatAddress,
  isContactDraftBlank,
  textOrNull,
  textProblem,
  uuidv7,
  type Location,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { FormScreen } from '@/components/form-screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { useIdErrorText } from '@/features/auth/error-text';
import { useT } from '@/lib/i18n';
import { useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { AddressFields, confirmAction, ContactFields, SaveError, useProblemText } from './parts';
import { useArchiveLocation, useLocations, useSaveLocation } from './queries';

/** Saved locations (vendor fulfilment / buyer delivery). Owner/admin manage; everyone reads. */
export function LocationsScreen() {
  const t = useT('settings');
  const c = useTokenColors();
  const { account, organization } = useBusiness();
  const vendor = organization.type === 'VENDOR';
  const canEdit = canManageOrganization(account.role);
  const [archived, setArchived] = useState(false);
  const locations = useLocations({ size: 100, state: archived ? 'ARCHIVED' : 'ACTIVE' });
  const [editing, setEditing] = useState<Location | 'new' | null>(null);

  if (editing) {
    return (
      <LocationForm
        key={editing === 'new' ? 'new' : editing.id}
        existing={editing === 'new' ? undefined : editing}
        vendor={vendor}
        country={organization.country}
        onReload={async () => (await locations.refetch()).data?.items.find((l) => editing !== 'new' && l.id === editing.id)}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <FormScreen>
      <AppText className="text-sm text-muted-foreground">
        {vendor ? t('locations.vendorDescription') : t('locations.buyerDescription')} {!canEdit && t('readOnly')}
      </AppText>
      <View className="flex-row gap-2">
        <Chip role="radio" label={t('stateFilter.ACTIVE')} selected={!archived} onPress={() => setArchived(false)} />
        <Chip role="radio" label={t('stateFilter.ARCHIVED')} selected={archived} onPress={() => setArchived(true)} />
      </View>
      {locations.isError ? (
        <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
      ) : locations.isPending ? (
        <LoadingState />
      ) : locations.data.items.length === 0 ? (
        <EmptyState title={t('locations.empty')} description={canEdit ? t('locations.emptyHint') : undefined} />
      ) : (
        <View className="overflow-hidden rounded-lg border border-border">
          {locations.data.items.map((l, i) => (
            <Pressable
              key={l.id}
              disabled={!canEdit}
              accessibilityRole={canEdit ? 'button' : undefined}
              onPress={() => setEditing(l)}
              className={`flex-row items-center gap-3 bg-background p-3 active:bg-muted ${i > 0 ? 'border-t border-border' : ''}`}>
              <MapPin size={18} color={c['muted-foreground']} />
              <View className="flex-1 gap-0.5">
                <AppText weight="medium" className="text-base text-foreground">
                  {l.name}
                </AppText>
                <AppText className="text-xs text-muted-foreground">{formatAddress(l.address)}</AppText>
              </View>
              {l.state === 'ARCHIVED' && <Badge>{t('archived')}</Badge>}
              {canEdit && <ChevronRight size={18} color={c['muted-foreground']} />}
            </Pressable>
          ))}
        </View>
      )}
      {canEdit && <Button onPress={() => setEditing('new')}>{t('locations.add')}</Button>}
    </FormScreen>
  );
}

function LocationForm({
  existing: initial,
  vendor,
  country,
  onReload,
  onClose,
}: {
  existing?: Location;
  vendor: boolean;
  country: Location['address']['country'];
  onReload: () => Promise<Location | undefined>;
  onClose: () => void;
}) {
  const t = useT('settings');
  const tc = useT('common');
  const problemText = useProblemText();
  const errorText = useIdErrorText();
  // One id per create intent: a retry after a lost response replays instead of duplicating.
  const [id] = useState(uuidv7);
  const [existing, setExisting] = useState(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? emptyAddress(country));
  const [contact, setContact] = useState(() => contactDraftFrom(initial?.contact ?? null));
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [attempted, setAttempted] = useState(false);
  const save = useSaveLocation();
  const archive = useArchiveLocation();
  const noContact = vendor && isContactDraftBlank(contact);
  const nameProblem = textProblem(name);
  const addrProblems = addressProblems(address);
  const cProblems = noContact ? {} : contactProblems(contact);
  const invalid = !!nameProblem || Object.keys(addrProblems).length > 0 || Object.keys(cProblems).length > 0;

  return (
    <FormScreen>
      <Card>
        <CardHeader title={existing ? t('locations.edit') : t('locations.add')} />
        <FieldGroup>
          <SaveError
            error={save.error}
            onLoadLatest={() =>
              void onReload().then((fresh) => {
                if (fresh) setExisting(fresh);
                save.reset();
              })
            }
          />
          <Field label={t('locations.name')}>
            <Input value={name} onChangeText={setName} accessibilityLabel={t('locations.name')} />
            <FieldError>{attempted ? problemText(nameProblem) : undefined}</FieldError>
          </Field>
          <AddressFields value={address} onChange={setAddress} problems={attempted ? addrProblems : {}} />
          <AppText weight="medium" className="text-sm text-foreground">
            {vendor ? t('locations.contactOptional') : t('locations.contactRequired')}
          </AppText>
          <ContactFields value={contact} onChange={setContact} problems={attempted ? cProblems : {}} />
          <Field label={t('locations.instructions')} description={t('locations.instructionsHint')}>
            <Input value={instructions} onChangeText={setInstructions} multiline className="h-24 py-2" accessibilityLabel={t('locations.instructions')} />
          </Field>
          <Button
            loading={save.isPending}
            onPress={() => {
              setAttempted(true);
              if (invalid) return;
              save.mutate(
                {
                  id,
                  existing,
                  fields: { name: name.trim(), address: cleanAddress(address), contact: noContact ? null : contactFromDraft(contact), instructions: textOrNull(instructions) },
                },
                { onSuccess: onClose },
              );
            }}>
            {tc('save')}
          </Button>
          {existing && (
            <Button
              variant={existing.state === 'ACTIVE' ? 'destructive' : 'outline'}
              loading={archive.isPending}
              onPress={() => {
                const run = () =>
                  archive.mutate({ location: existing, archive: existing.state === 'ACTIVE' }, { onSuccess: onClose, onError: (e) => Alert.alert(errorText(e)) });
                if (existing.state !== 'ACTIVE') return run();
                void confirmAction(t('locations.archiveTitle', { name: existing.name }), t('locations.archiveDescription'), t('archive'), tc('cancel')).then(
                  (ok) => ok && run(),
                );
              }}>
              {existing.state === 'ACTIVE' ? t('archive') : t('restore')}
            </Button>
          )}
          <Button variant="ghost" onPress={onClose}>
            {tc('cancel')}
          </Button>
        </FieldGroup>
      </Card>
    </FormScreen>
  );
}
