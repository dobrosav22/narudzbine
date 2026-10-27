import { useCallback } from 'react';
import { fieldProblemMsg, isApiError } from '@repo/core';
import { useErrorText, useMsg } from '@/lib/i18n';

/** Identity/organization screens use the shared problem-code mapping (identity codes live in `problems.codes`). */
export { useErrorText as useIdErrorText };

/** Field-level message for a 422 field error at a body path (`newPassword`, `registeredAddress/city`). */
export function useFieldErrorText() {
  const tm = useMsg();
  return useCallback(
    (error: unknown, path: string): string | undefined => {
      if (!isApiError(error)) return undefined;
      const m = fieldProblemMsg(error.fieldCode(path));
      return m ? tm(m) : undefined;
    },
    [tm],
  );
}
