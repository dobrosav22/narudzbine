import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, View } from 'react-native';
import { isApiError } from '@repo/core';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { useT } from '@/lib/i18n';
import { sessionStore } from '@/lib/session';

/**
 * Guarded actions need a password proof from the last five minutes. On 403
 * REAUTHENTICATION_REQUIRED `guarded(action)` asks for the password, rotates the bearer
 * (POST /auth/reauthentication) and runs the action once more. Mirrors apps/web.
 */
type Guarded = <T>(action: () => Promise<T>) => Promise<T>;

const ReauthContext = createContext<Guarded | null>(null);

export function ReauthProvider({ children }: { children: React.ReactNode }) {
  const t = useT('reauth');
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const waiter = useRef<{ resolve: () => void; reject: () => void } | null>(null);

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        waiter.current = { resolve, reject };
        setPassword('');
        setError(null);
        setOpen(true);
      }),
    [],
  );

  const guarded = useCallback<Guarded>(
    async (action) => {
      try {
        return await action();
      } catch (first) {
        if (!isApiError(first, 'REAUTHENTICATION_REQUIRED')) throw first;
        try {
          await ask();
        } catch {
          throw first;
        }
        return action();
      }
    },
    [ask],
  );

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await sessionStore.reauthenticate(password);
      setOpen(false);
      waiter.current?.resolve();
      waiter.current = null;
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    setOpen(false);
    waiter.current?.reject();
    waiter.current = null;
  }

  return (
    <ReauthContext.Provider value={guarded}>
      {children}
      <Modal visible={open} transparent animationType="fade" onRequestClose={cancel}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-center bg-black/50 p-6">
          <View className="gap-4 rounded-xl bg-background p-5">
            <AppText weight="semibold" className="text-lg text-foreground">
              {t('title')}
            </AppText>
            <AppText className="text-sm text-muted-foreground">{t('description')}</AppText>
            <FormError error={error} />
            <Field label={t('password')}>
              <Input secureTextEntry autoComplete="current-password" autoFocus value={password} onChangeText={setPassword} onSubmitEditing={submit} />
            </Field>
            <View className="flex-row justify-end gap-2">
              <Button variant="outline" onPress={cancel}>
                {t('cancel')}
              </Button>
              <Button onPress={submit} loading={pending} disabled={!password}>
                {t('confirm')}
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ReauthContext.Provider>
  );
}

export function useGuarded(): Guarded {
  const guarded = useContext(ReauthContext);
  if (!guarded) throw new Error('useGuarded needs ReauthProvider');
  return guarded;
}
