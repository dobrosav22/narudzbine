import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime, services, type OrderMessage } from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { useTokenColors } from '@/theme';
import { useT } from '@/lib/i18n';

/**
 * 01 §5 order messaging on mobile — shared by buyer and vendor order screens,
 * mirroring web's OrderThread. `side` decides which messages are "ours".
 */
export function OrderThread({
  orderId,
  side,
  myUserId,
  counterpartName,
  senderName,
}: {
  orderId: string;
  side: 'buyer' | 'vendor';
  myUserId: string;
  counterpartName: string;
  senderName: (m: OrderMessage) => string;
}) {
  const c = useTokenColors();
  const t = useT('orders.thread');
  const tmo = useT('m.orders');
  const qc = useQueryClient();
  const key = ['orderMessages', orderId];
  const messages = useQuery({ queryKey: key, queryFn: () => services.orders.listOrderMessages(orderId) });
  const send = useMutation({
    mutationFn: (text: string) => services.orders.addOrderMessage(orderId, { senderUserId: myUserId, senderOrgType: side, text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim()) return;
    send.mutate(text, { onSuccess: () => setText('') });
  };

  return (
    <Card>
      <CardHeader title={t('title')} description={t('visibleTo', { name: counterpartName })} />
      {messages.isError ? (
        <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
      ) : messages.isPending ? (
        <LoadingState label={tmo('loadingMessages')} />
      ) : messages.data.length === 0 ? (
        <AppText className="text-center text-sm text-muted-foreground">{t('empty')}</AppText>
      ) : (
        <View className="gap-3">
          {messages.data.map((m) => {
            const ours = m.senderOrgType === side;
            const name = m.senderUserId === myUserId ? t('you') : senderName(m);
            return (
              // Same treatment as web's Bubble: own side tinted violet (subtle), other side muted.
              <View key={m.id} className={`max-w-[85%] gap-1 ${ours ? 'self-end items-end' : 'self-start items-start'}`}>
                <AppText className="text-xs text-muted-foreground">{name}</AppText>
                <View className={`rounded-2xl px-3 py-2 ${ours ? 'bg-primary-subtle' : 'bg-muted'}`}>
                  <AppText className="text-sm text-foreground">{m.text}</AppText>
                </View>
                <AppText className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</AppText>
              </View>
            );
          })}
        </View>
      )}
      <View className="gap-2">
        <TextInput
          accessibilityLabel={t('label', { name: counterpartName })}
          placeholder={t('placeholder', { name: counterpartName })}
          placeholderTextColor={c['muted-foreground']}
          selectionColor={c.primary}
          multiline
          value={text}
          onChangeText={setText}
          className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 font-sans text-base text-foreground"
          textAlignVertical="top"
        />
        <Button size="sm" className="self-end" loading={send.isPending} disabled={!text.trim()} onPress={submit}>
          {t('send')}
        </Button>
        {send.error ? <FormError error={send.error} /> : null}
      </View>
    </Card>
  );
}
