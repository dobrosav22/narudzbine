import { Alert, View } from 'react-native';
import type { Address, ContactDraft, DraftProblem } from '@repo/core';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { IdFormError } from '@/features/auth/form-error';
import { useT } from '@/lib/i18n';

/** Text for a client-side draft problem. */
export function useProblemText() {
  const t = useT('settings');
  return (p: DraftProblem | null | undefined) => (p ? t(p) : undefined);
}

/** Address members; the country is the organization's and can't change. */
export function AddressFields({
  value,
  onChange,
  problems,
  disabled,
}: {
  value: Address;
  onChange: (next: Address) => void;
  problems: Partial<Record<'line1' | 'city' | 'postalCode', DraftProblem>>;
  disabled?: boolean;
}) {
  const t = useT('settings');
  const problemText = useProblemText();
  return (
    <View className="gap-4">
      <Field label={t('address.line1')}>
        <Input value={value.line1} editable={!disabled} onChangeText={(line1) => onChange({ ...value, line1 })} autoComplete="street-address" accessibilityLabel={t('address.line1')} />
        <FieldError>{problemText(problems.line1)}</FieldError>
      </Field>
      <Field label={`${t('address.line2')} (${t('optional')})`}>
        <Input value={value.line2 ?? ''} editable={!disabled} onChangeText={(v) => onChange({ ...value, line2: v || null })} accessibilityLabel={t('address.line2')} />
      </Field>
      <View className="flex-row gap-3">
        <View className="w-28">
          <Field label={t('address.postalCode')}>
            <Input value={value.postalCode} editable={!disabled} onChangeText={(postalCode) => onChange({ ...value, postalCode })} autoComplete="postal-code" accessibilityLabel={t('address.postalCode')} />
            <FieldError>{problemText(problems.postalCode)}</FieldError>
          </Field>
        </View>
        <View className="flex-1">
          <Field label={t('address.city')}>
            <Input value={value.city} editable={!disabled} onChangeText={(city) => onChange({ ...value, city })} accessibilityLabel={t('address.city')} />
            <FieldError>{problemText(problems.city)}</FieldError>
          </Field>
        </View>
      </View>
      <AppText className="text-sm text-muted-foreground">
        {t('address.country')}: {t(`countries.${value.country}`)}
      </AppText>
    </View>
  );
}

export function ContactFields({
  value,
  onChange,
  problems,
}: {
  value: ContactDraft;
  onChange: (next: ContactDraft) => void;
  problems: Partial<Record<keyof ContactDraft, DraftProblem>>;
}) {
  const t = useT('settings');
  const problemText = useProblemText();
  return (
    <View className="gap-4">
      <Field label={t('contactFields.name')}>
        <Input value={value.name} onChangeText={(name) => onChange({ ...value, name })} accessibilityLabel={t('contactFields.name')} />
        <FieldError>{problemText(problems.name)}</FieldError>
      </Field>
      <Field label={t('contactFields.phone')} description={problems.phone ? undefined : t('contactFields.phoneHint')}>
        <Input value={value.phone} onChangeText={(phone) => onChange({ ...value, phone })} keyboardType="phone-pad" accessibilityLabel={t('contactFields.phone')} />
        <FieldError>{problemText(problems.phone)}</FieldError>
      </Field>
      <Field label={`${t('contactFields.email')} (${t('optional')})`}>
        <Input value={value.email} onChangeText={(email) => onChange({ ...value, email })} autoCapitalize="none" keyboardType="email-address" accessibilityLabel={t('contactFields.email')} />
        <FieldError>{problemText(problems.email)}</FieldError>
      </Field>
    </View>
  );
}

/** Save error; on REVISION_CONFLICT the draft stays and the person reloads the latest revision. */
export function SaveError({ error, onLoadLatest }: { error: unknown; onLoadLatest: () => void }) {
  const t = useT('settings');
  if (!error) return null;
  const conflict = (error as { code?: string }).code === 'REVISION_CONFLICT';
  return (
    <View className="gap-2">
      {conflict ? <AppText className="text-sm text-destructive">{t('revisionConflict')}</AppText> : <IdFormError error={error} />}
      {conflict && (
        <Button variant="outline" size="sm" onPress={onLoadLatest}>
          {t('loadLatest')}
        </Button>
      )}
    </View>
  );
}

/** Confirmation dialog; resolves true when confirmed. */
export function confirmAction(title: string, message: string, action: string, cancel: string, destructive = true): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}
