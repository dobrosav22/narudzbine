import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { codePointLength, isApiError, isUncertainOutcome, isValidText, REASON_MAX } from '@repo/core';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { useTokenColors } from '@/theme';
import { useT } from '@/lib/i18n';

/** A failed order action, with the stale / uncertain-outcome hint (mirrors web ActionError). */
export function ActionError({ error }: { error: unknown }) {
  const t = useT('orders');
  if (!error) return null;
  const stale = isApiError(error, 'REVISION_CONFLICT') || isApiError(error, 'INVALID_STATE');
  return (
    <View className="gap-1">
      <FormError error={error} />
      {stale || isUncertainOutcome(error) ? (
        <AppText className="text-xs text-muted-foreground">{stale ? t('staleNote') : t('uncertainNote')}</AppText>
      ) : null}
    </View>
  );
}

/**
 * Inline confirmation for an order action (mobile counterpart of web's Confirm/Reason dialogs).
 * With `reason`, a required 1–1000 code point plain-text reason is collected and kept while the
 * panel is open, so a retry after an uncertain outcome resends the exact same body.
 */
export function ActionPanel({
  title,
  description,
  reason = false,
  confirmLabel,
  destructive,
  pending,
  error,
  onConfirm,
  onBack,
  children,
}: {
  title: string;
  description: string;
  reason?: boolean;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: (reason: string) => void;
  onBack: () => void;
  children?: React.ReactNode;
}) {
  const c = useTokenColors();
  const tr = useT('orders.reason');
  const tmo = useT('mOrders');
  const [text, setText] = useState('');
  const valid = !reason || isValidText(text, REASON_MAX);
  return (
    <View accessibilityRole="alert" className="gap-3 rounded-lg border border-border bg-card p-3">
      <AppText weight="semibold" className="text-base text-foreground">
        {title}
      </AppText>
      <AppText className="text-sm text-muted-foreground">{description}</AppText>
      {children}
      {reason && (
        <View className="gap-1">
          <TextInput
            accessibilityLabel={tr('label')}
            placeholder={tmo('reasonPlaceholder')}
            placeholderTextColor={c['muted-foreground']}
            selectionColor={c.primary}
            multiline
            value={text}
            onChangeText={setText}
            textAlignVertical="top"
            className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 font-sans text-base text-foreground"
          />
          <AppText className="text-xs text-muted-foreground">{tr('count', { count: codePointLength(text.trim()), max: REASON_MAX })}</AppText>
        </View>
      )}
      <ActionError error={error} />
      <View className="flex-row gap-2">
        <Button size="sm" variant="outline" onPress={onBack}>
          {tmo('back')}
        </Button>
        <Button size="sm" variant={destructive ? 'destructive' : 'default'} loading={pending} disabled={!valid} onPress={() => onConfirm(text)}>
          {confirmLabel}
        </Button>
      </View>
    </View>
  );
}
