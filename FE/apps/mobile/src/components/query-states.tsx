import { ActivityIndicator, Pressable, View } from 'react-native';
import { isApiError } from '@repo/core';
import { AppText } from '@/components/app-text';
import { useTokenColors } from '@/theme';
import { useErrorText, useT } from '@/lib/i18n';

export function LoadingState({ label: given }: { label?: string }) {
  const t = useT('mCommon');
  const label = given ?? t('loading');
  const c = useTokenColors();
  return (
    <View
      className="flex-1 items-center justify-center gap-2 bg-background p-6"
      accessibilityRole="progressbar"
      accessibilityLabel={label}>
      <ActivityIndicator color={c.primary} />
      <AppText className="text-sm text-muted-foreground">{label}</AppText>
    </View>
  );
}

/** Mirrors web's destructive Alert: an unreachable server (NETWORK_ERROR) gets its own title; retry when given. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT('states');
  const errorText = useErrorText();
  const unreachable = isApiError(error, 'NETWORK_ERROR');
  return (
    <View className="flex-1 bg-background p-4">
      <View className="gap-2 rounded-lg border border-border bg-card p-4" accessibilityRole="alert">
        <AppText weight="medium" className="text-sm text-destructive">
          {unreachable ? t('serverUnreachable') : t('somethingWentWrong')}
        </AppText>
        <AppText className="text-sm text-destructive/90">
          {errorText(error)}
        </AppText>
        {onRetry && (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            className="mt-1 self-start rounded-lg border border-border bg-background px-3 py-2 active:bg-muted">
            <AppText weight="medium" className="text-sm text-foreground">
              {t('tryAgain')}
            </AppText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Mirrors web's Empty: dashed border, centred title + description. */
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View className="m-4 items-center justify-center gap-2 rounded-xl border border-dashed border-border p-8">
      <AppText weight="medium" className="text-base text-foreground">
        {title}
      </AppText>
      {description && <AppText className="text-center text-sm text-muted-foreground">{description}</AppText>}
    </View>
  );
}
