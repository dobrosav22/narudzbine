"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isApiError } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormError } from "@/features/auth/form-error";
import { sessionStore } from "@/lib/session";

/**
 * Guarded actions (role changes, ownership transfer, revoke-all sessions, email/password and
 * external-identity changes...) need a password proof from the last five minutes. The backend
 * answers 403 REAUTHENTICATION_REQUIRED; `guarded(action)` then asks for the password, rotates
 * the session credentials (POST /auth/reauthentication) and runs the action once more.
 * No MFA exists at launch. Cancelling rejects with the original error.
 */
type Guarded = <T>(action: () => Promise<T>) => Promise<T>;

const ReauthContext = createContext<Guarded | null>(null);

export function ReauthProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("reauth");
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const waiter = useRef<{ resolve: () => void; reject: () => void } | null>(null);

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        waiter.current = { resolve, reject };
        setPassword("");
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
        if (!isApiError(first, "REAUTHENTICATION_REQUIRED")) throw first;
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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

  function cancel(next: boolean) {
    if (next) return;
    setOpen(false);
    waiter.current?.reject();
    waiter.current = null;
  }

  return (
    <ReauthContext.Provider value={guarded}>
      {children}
      <Dialog open={open} onOpenChange={cancel}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{t("description")}</DialogDescription>
            </DialogHeader>
            <FormError error={error} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="reauth-password">{t("password")}</FieldLabel>
                <Input id="reauth-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => cancel(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending || !password}>
                {t("confirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ReauthContext.Provider>
  );
}

/** `const guarded = useGuarded(); await guarded(() => mutation.mutateAsync(input))`. */
export function useGuarded(): Guarded {
  const guarded = useContext(ReauthContext);
  if (!guarded) throw new Error("useGuarded needs ReauthProvider");
  return guarded;
}
