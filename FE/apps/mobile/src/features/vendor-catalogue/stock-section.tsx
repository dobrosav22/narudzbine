import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { formatNumber, isUncertainOutcome, parseDeltaInput, parseQuantityInput, stockStatus, STOCK_REASON_MAX, uuidv4, type Stock } from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { useT } from '@/lib/i18n';
import { CatalogueFormError, StockStatusBadge } from './parts';
import { useStock, useStockMutations, useTracking } from './queries';

/** Stock on the product editor (mobile). */
export function StockSection({ productId }: { productId: string }) {
  const t = useT('invInventory.stock');
  const stock = useStock(productId);
  const tracking = useTracking();
  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <AppText weight="semibold" className="text-xl text-card-foreground">
          {t('title')}
        </AppText>
        <StockStatusBadge stock={stock.data} />
      </View>
      <AppText className="text-sm text-muted-foreground">{tracking.data && !tracking.data.enabled ? t('trackingOffNote') : t('trackingOnHint')}</AppText>
      {stock.isError ? <ErrorState error={stock.error} onRetry={() => void stock.refetch()} /> : !stock.data ? <LoadingState /> : <StockEditor stock={stock.data} />}
      <Button size="sm" variant="ghost" className="self-start" onPress={() => router.push('/vendor/inventory')}>
        {t('manage')}
      </Button>
    </Card>
  );
}

/** Set (revision-guarded), adjust (Idempotency-Key per pending intent) or confirm one product's count. */
export function StockEditor({ stock, onDone }: { stock: Stock; onDone?: () => void }) {
  const t = useT('invInventory.stock');
  const m = useStockMutations(stock.productId);
  const [mode, setMode] = useState<'set' | 'adjust'>(stock.availableCount === null ? 'set' : 'adjust');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string>();
  const [intent, setIntent] = useState<{ body: string; key: string } | null>(null);
  const pending = m.set.isPending || m.adjust.isPending || m.confirm.isPending;
  const uncertain = m.adjust.isError && isUncertainOutcome(m.adjust.error);
  const finish = () => {
    setValue('');
    setReason('');
    setIntent(null);
    onDone?.();
  };

  const submit = () => {
    setProblem(undefined);
    const r = reason.trim();
    if (Array.from(r).length > STOCK_REASON_MAX) return setProblem(t('reasonTooLong', { max: STOCK_REASON_MAX }));
    if (mode === 'set') {
      const n = parseQuantityInput(value, 0, stock.maximumSettableCount);
      if (n == null) return setProblem(t('countInvalid', { max: formatNumber(stock.maximumSettableCount) }));
      m.set.mutate({ expectedRevision: stock.revision, availableCount: n, reason: r || null }, { onSuccess: finish });
    } else {
      const d = parseDeltaInput(value);
      if (d == null) return setProblem(t('deltaInvalid'));
      const body = { delta: d, reason: r || null };
      const signature = JSON.stringify(body);
      const key = intent?.body === signature ? intent.key : uuidv4();
      setIntent({ body: signature, key });
      m.adjust.mutate({ body, key }, { onSuccess: finish });
    }
  };

  return (
    <View className="gap-3">
      <View className="flex-row items-baseline gap-2">
        <AppText mono weight="semibold" className="text-2xl text-foreground">
          {stock.availableCount === null ? '—' : formatNumber(stock.availableCount)}
        </AppText>
        {stock.cancellationCreditQuantity > 0 && (
          <AppText className="text-sm text-muted-foreground">{t('credit', { count: formatNumber(stock.cancellationCreditQuantity) })}</AppText>
        )}
      </View>
      {stockStatus(stock) === 'stale' && (
        <Button size="sm" variant="outline" className="self-start" loading={m.confirm.isPending} disabled={pending} onPress={() => m.confirm.mutate(stock.revision, { onSuccess: finish })}>
          {t('confirm')}
        </Button>
      )}
      <View className="flex-row gap-2" accessibilityRole="radiogroup">
        <Chip role="radio" label={t('set')} selected={mode === 'set'} onPress={() => setMode('set')} />
        {stock.availableCount !== null && <Chip role="radio" label={t('adjust')} selected={mode === 'adjust'} onPress={() => setMode('adjust')} />}
      </View>
      <Field label={mode === 'set' ? t('newCount') : t('delta')}>
        <Input
          value={value}
          keyboardType={mode === 'set' ? 'number-pad' : 'numbers-and-punctuation'}
          placeholder={mode === 'adjust' ? t('deltaPlaceholder') : undefined}
          onChangeText={setValue}
          accessibilityLabel={mode === 'set' ? t('newCount') : t('delta')}
        />
      </Field>
      <Field label={t('reason')}>
        <Input value={reason} placeholder={t('reasonPlaceholder')} onChangeText={setReason} accessibilityLabel={t('reason')} />
      </Field>
      <FieldError>{problem}</FieldError>
      {uncertain ? <AppText className="text-sm text-destructive">{t('uncertain')}</AppText> : <CatalogueFormError error={m.set.error ?? m.adjust.error ?? m.confirm.error} />}
      <Button loading={m.set.isPending || m.adjust.isPending} disabled={pending} onPress={submit}>
        {uncertain ? t('retry') : mode === 'set' ? t('set') : t('adjust')}
      </Button>
    </View>
  );
}
