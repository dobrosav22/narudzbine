import { useState } from 'react';
import { Alert, View } from 'react-native';
import { ContactRound, Languages } from 'lucide-react-native';
import {
  addressProblems,
  BACKEND_LOCALES,
  canManageOrganization,
  cleanAddress,
  contactDraftFrom,
  contactFromDraft,
  contactProblems,
  organizationUpdate,
  textProblem,
  uuidv7,
  type BusinessContact,
  type Locale,
  type Organization,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { FormScreen } from '@/components/form-screen';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { SwitchRow } from '@/components/ui/switch-row';
import { OptionRow, Section } from '@/features/account/rows';
import { useIdErrorText } from '@/features/auth/error-text';
import { useT } from '@/lib/i18n';
import { useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { AddressFields, ContactFields, SaveError, useProblemText } from './parts';
import { useArchiveContact, useContacts, useOrganization, useSaveContact, useUpdateOrganization } from './queries';

/**
 * Company details (owner/admin edit, everyone reads) and business contacts. Closing the
 * organization, the activity log and privacy requests are on the web app.
 */
export function CompanyScreen() {
  const { account } = useBusiness();
  const org = useOrganization();
  const [editingContact, setEditingContact] = useState<BusinessContact | 'new' | null>(null);
  const contacts = useContacts({ size: 100 });
  const canEdit = canManageOrganization(account.role);
  if (org.isError) return <ErrorState error={org.error} onRetry={() => void org.refetch()} />;
  if (org.isPending) return <LoadingState />;
  if (editingContact) {
    return (
      <ContactForm
        key={editingContact === 'new' ? 'new' : editingContact.id}
        existing={editingContact === 'new' ? undefined : editingContact}
        onReload={async () => (await contacts.refetch()).data?.items.find((c) => editingContact !== 'new' && c.id === editingContact.id)}
        onClose={() => setEditingContact(null)}
      />
    );
  }
  return (
    <CompanyForm
      key={org.data.id}
      org={org.data}
      canEdit={canEdit}
      contacts={contacts.data?.items ?? []}
      onReload={() => void org.refetch()}
      onEditContact={setEditingContact}
    />
  );
}

function CompanyForm({
  org,
  canEdit,
  contacts,
  onReload,
  onEditContact,
}: {
  org: Organization;
  canEdit: boolean;
  contacts: BusinessContact[];
  onReload: () => void;
  onEditContact: (c: BusinessContact | 'new') => void;
}) {
  const t = useT('settings');
  const c = useTokenColors();
  const problemText = useProblemText();
  const save = useUpdateOrganization();
  const [displayName, setDisplayName] = useState(org.displayName);
  const [legalName, setLegalName] = useState(org.legalName);
  const [address, setAddress] = useState(org.registeredAddress);
  const [language, setLanguage] = useState<Locale>(org.defaultLanguage);
  const [restricted, setRestricted] = useState(org.staffSubmissionRestricted);
  const [partner, setPartner] = useState(org.partnerContactId);
  const [attempted, setAttempted] = useState(false);
  const nameProblem = textProblem(displayName, { max: 200 });
  const legalProblem = textProblem(legalName, { max: 200 });
  const addrProblems = addressProblems(address);
  const invalid = !!nameProblem || !!legalProblem || Object.keys(addrProblems).length > 0;
  const active = contacts.filter((x) => x.state === 'ACTIVE');
  const icon = (I: typeof Languages) => <I size={18} color={c['muted-foreground']} />;

  return (
    <FormScreen>
      <Card>
        <CardHeader title={t('company.title')} description={canEdit ? t('company.description') : t('readOnly')} />
        <FieldGroup>
          <SaveError error={save.error} onLoadLatest={() => { save.reset(); onReload(); }} />
          <Field label={t('company.displayName')}>
            <Input value={displayName} editable={canEdit} onChangeText={setDisplayName} accessibilityLabel={t('company.displayName')} />
            <FieldError>{attempted ? problemText(nameProblem) : undefined}</FieldError>
          </Field>
          <Field label={t('company.legalName')}>
            <Input value={legalName} editable={canEdit} onChangeText={setLegalName} accessibilityLabel={t('company.legalName')} />
            <FieldError>{attempted ? problemText(legalProblem) : undefined}</FieldError>
          </Field>
          <AppText weight="medium" className="text-sm text-foreground">
            {t('company.registeredAddress')}
          </AppText>
          <AddressFields value={address} onChange={setAddress} problems={attempted ? addrProblems : {}} disabled={!canEdit} />
          {org.type === 'BUYER' && (
            <SwitchRow label={t('company.staffRestricted')} description={t('company.staffRestrictedHint')} value={restricted} disabled={!canEdit} onValueChange={setRestricted} />
          )}
        </FieldGroup>
      </Card>

      <Section title={t('company.defaultLanguage')}>
        {BACKEND_LOCALES.map((l) => (
          <OptionRow key={l.value} icon={icon(Languages)} title={l.label} selected={language === l.value} onPress={canEdit ? () => setLanguage(l.value) : undefined} />
        ))}
      </Section>

      <Section title={t('company.partnerContact')}>
        <OptionRow icon={icon(ContactRound)} title={t('company.noPartnerContact')} selected={partner === null} onPress={canEdit ? () => setPartner(null) : undefined} />
        {active.map((x) => (
          <OptionRow
            key={x.id}
            icon={icon(ContactRound)}
            title={x.label}
            subtitle={`${x.contact.name}, ${x.contact.phone}`}
            selected={partner === x.id}
            onPress={canEdit ? () => setPartner(x.id) : undefined}
          />
        ))}
      </Section>

      {canEdit && (
        <Button
          loading={save.isPending}
          onPress={() => {
            setAttempted(true);
            if (invalid) return;
            save.mutate(
              organizationUpdate(org, {
                displayName: displayName.trim(),
                legalName: legalName.trim(),
                registeredAddress: cleanAddress(address),
                defaultLanguage: language,
                staffSubmissionRestricted: restricted,
                partnerContactId: partner,
              }),
              { onSuccess: () => Alert.alert(t('company.saved')) },
            );
          }}>
          {t('company.save')}
        </Button>
      )}

      <Card>
        <CardHeader title={t('company.identity')} description={t('company.identityHint')} />
        {(
          [
            [t('company.type'), t(`company.types.${org.type}`)],
            [t('company.country'), t(`countries.${org.country}`)],
            [t('company.currency'), org.currency],
            [t('company.registrationIdentifier'), org.registrationIdentifier],
            [t('company.taxIdentifier'), org.taxIdentifier ?? '—'],
          ] as const
        ).map(([label, value]) => (
          <View key={label} className="flex-row justify-between gap-3">
            <AppText className="text-sm text-muted-foreground">{label}</AppText>
            <AppText weight="medium" className="flex-1 text-right text-sm text-foreground">
              {value}
            </AppText>
          </View>
        ))}
      </Card>

      <Card>
        <CardHeader title={t('contacts.title')} description={t('contacts.description')} />
        {contacts.length === 0 && <AppText className="text-sm text-muted-foreground">{t('contacts.empty')}</AppText>}
        {contacts.map((x) => (
          <View key={x.id} className="flex-row items-center gap-3 border-t border-border pt-3">
            <View className="flex-1 gap-0.5">
              <AppText weight="medium" className="text-sm text-foreground">
                {x.label}
              </AppText>
              <AppText className="text-xs text-muted-foreground">
                {x.contact.name}, {x.contact.phone}
              </AppText>
            </View>
            {org.partnerContactId === x.id && <Badge variant="brand">{t('contacts.shared')}</Badge>}
            {x.state === 'ARCHIVED' && <Badge>{t('archived')}</Badge>}
            {canEdit && (
              <Button variant="ghost" size="sm" onPress={() => onEditContact(x)}>
                {t('contacts.edit')}
              </Button>
            )}
          </View>
        ))}
        {canEdit && (
          <Button variant="outline" onPress={() => onEditContact('new')}>
            {t('contacts.add')}
          </Button>
        )}
      </Card>
    </FormScreen>
  );
}

function ContactForm({ existing: initial, onReload, onClose }: { existing?: BusinessContact; onReload: () => Promise<BusinessContact | undefined>; onClose: () => void }) {
  const t = useT('settings');
  const tc = useT('common');
  const problemText = useProblemText();
  const errorText = useIdErrorText();
  // One id per create intent.
  const [id] = useState(uuidv7);
  const [existing, setExisting] = useState(initial);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [contact, setContact] = useState(() => contactDraftFrom(initial?.contact ?? null));
  const [attempted, setAttempted] = useState(false);
  const save = useSaveContact();
  const archive = useArchiveContact();
  const labelProblem = textProblem(label);
  const problems = contactProblems(contact);
  return (
    <FormScreen>
      <Card>
        <CardHeader title={existing ? t('contacts.edit') : t('contacts.add')} />
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
          <Field label={t('contacts.label')} description={t('contacts.labelHint')}>
            <Input value={label} onChangeText={setLabel} accessibilityLabel={t('contacts.label')} />
            <FieldError>{attempted ? problemText(labelProblem) : undefined}</FieldError>
          </Field>
          <ContactFields value={contact} onChange={setContact} problems={attempted ? problems : {}} />
          <Button
            loading={save.isPending}
            onPress={() => {
              setAttempted(true);
              if (labelProblem || Object.keys(problems).length) return;
              save.mutate({ id, existing, label: label.trim(), contact: contactFromDraft(contact) }, { onSuccess: onClose });
            }}>
            {tc('save')}
          </Button>
          {existing && (
            <Button
              variant="outline"
              loading={archive.isPending}
              onPress={() => archive.mutate({ contact: existing, archive: existing.state === 'ACTIVE' }, { onSuccess: onClose, onError: (e) => Alert.alert(errorText(e)) })}>
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
