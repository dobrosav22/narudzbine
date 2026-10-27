import { View } from 'react-native';
import type { CartScope } from '@repo/core';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { useT } from '@/lib/i18n';
import { useLoadLatestDraft, useSaveCartAsDraft } from './cart-actions';

/**
 * Inline choice after the linked shared draft changed elsewhere (409), was submitted/discarded or
 * is gone. The cart is kept; nothing is merged silently.
 */
export function DraftConflictPanel({ scope, onDone }: { scope: CartScope | undefined; onDone: (message: string | null) => void }) {
  const t = useT('cart');
  const save = useSaveCartAsDraft(scope);
  const load = useLoadLatestDraft(scope);
  const busy = save.isPending || load.isPending;
  return (
    <View accessibilityRole="alert" className="gap-3 rounded-lg border border-border bg-card p-4">
      <AppText weight="semibold" className="text-base text-foreground">
        {t('conflictTitle')}
      </AppText>
      <AppText className="text-sm text-muted-foreground">{t('conflictDescription')}</AppText>
      <Button
        loading={save.isPending}
        disabled={busy}
        onPress={() => save.mutate({ asNew: true }, { onSuccess: () => onDone(t('savedAsNew')) })}>
        {t('keepMineAsNew')}
      </Button>
      <Button
        variant="outline"
        loading={load.isPending}
        disabled={busy}
        onPress={() => load.mutate(undefined, { onSuccess: (d) => onDone(d && d.state === 'OPEN' ? t('latestLoaded') : t('draftGoneUnlinked')) })}>
        {t('loadLatest')}
      </Button>
      <Button variant="ghost" disabled={busy} onPress={() => onDone(null)}>
        {t('decideLater')}
      </Button>
      <FormError error={save.error ?? load.error} />
    </View>
  );
}
