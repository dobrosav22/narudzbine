import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { codePointLength, formatDateTime, intentFor, isUncertainOutcome, MESSAGE_MAX, pageItems, uuidv4, type PendingIntent } from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { useTokenColors } from '@/theme';
import { useT } from '@/lib/i18n';
import { ActionError } from './action-panel';
import { useOrderMessages, useSendOrderMessage } from './queries';

/**
 * The shared order thread on mobile (mirrors web): own messages name the teammate, the
 * counterparty appears as its organization; new messages carry a UUIDv4 Idempotency-Key kept
 * only for an exact retry after an uncertain outcome.
 */
export function OrderThread({
  orderId,
  ownOrganizationId,
  ownOrganizationName,
  ownAccountId,
  counterpartName,
  readOnly,
}: {
  orderId: string;
  ownOrganizationId: string;
  ownOrganizationName: string;
  ownAccountId: string;
  counterpartName: string;
  readOnly: boolean;
}) {
  const c = useTokenColors();
  const t = useT('orders.thread');
  const tmo = useT('mOrders');
  const messages = useOrderMessages(orderId);
  const send = useSendOrderMessage();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<PendingIntent<string> | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = messages;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const body = text.trim();
  const tooLong = codePointLength(body) > MESSAGE_MAX;

  const submit = () => {
    if (!body || tooLong || send.isPending) return;
    const intent = intentFor(pending, body, uuidv4);
    setPending(intent);
    send.mutate(
      { orderId, text: intent.body, idempotencyKey: intent.key },
      {
        onSuccess: () => {
          setText('');
          setPending(null);
        },
        onError: (e) => {
          if (!isUncertainOutcome(e)) setPending(null);
        },
      },
    );
  };

  const items = pageItems(messages.data?.pages);
  return (
    <Card>
      <CardHeader title={t('title')} description={t('visibleTo', { name: counterpartName })} />
      {messages.isError ? (
        <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
      ) : messages.isPending ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <AppText className="text-center text-sm text-muted-foreground">{t('empty')}</AppText>
      ) : (
        <View className="gap-3">
          {items.map((m) => {
            const ours = m.authorOrganizationId === ownOrganizationId;
            const mine = m.ownAuthorAccountId === ownAccountId;
            const author = mine ? t('you') : ours ? (m.ownAuthorDisplayName ?? ownOrganizationName) : counterpartName;
            return (
              <View key={m.id} className={`max-w-[85%] gap-1 ${ours ? 'items-end self-end' : 'items-start self-start'}`}>
                <AppText className="text-xs text-muted-foreground">{author}</AppText>
                <View className={`rounded-2xl px-3 py-2 ${ours ? 'bg-primary-subtle' : 'bg-muted'}`}>
                  <AppText className="text-sm text-foreground">{m.text}</AppText>
                </View>
                <AppText className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</AppText>
              </View>
            );
          })}
        </View>
      )}
      {readOnly ? (
        <AppText className="text-sm text-muted-foreground">{t('readOnly')}</AppText>
      ) : (
        <View className="gap-2">
          <TextInput
            accessibilityLabel={t('label', { name: counterpartName })}
            placeholder={tmo('messagePlaceholder')}
            placeholderTextColor={c['muted-foreground']}
            selectionColor={c.primary}
            multiline
            value={text}
            onChangeText={setText}
            className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 font-sans text-base text-foreground"
            textAlignVertical="top"
          />
          {tooLong && <AppText className="text-xs text-destructive">{t('tooLong', { max: MESSAGE_MAX })}</AppText>}
          <Button size="sm" className="self-end" loading={send.isPending} disabled={!body || tooLong} onPress={submit}>
            {t('send')}
          </Button>
          <ActionError error={send.error} />
        </View>
      )}
    </Card>
  );
}
