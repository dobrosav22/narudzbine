"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { CartScope } from "@repo/core";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useErrorText } from "@/lib/i18n";
import { useLoadLatestDraft, useSaveCartAsDraft } from "./cart-actions";

/**
 * Shown when the linked shared draft changed elsewhere (409 REVISION_CONFLICT), was submitted or
 * discarded (INVALID_STATE) or is gone. The user's cart is kept; nothing is merged silently. They
 * choose: keep their version as a new draft, take the latest shared version, or decide later.
 */
export function DraftConflictDialog({
  scope,
  open,
  onOpenChange,
  onResolved,
}: {
  scope: CartScope | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved?: () => void;
}) {
  const t = useTranslations("cart");
  const errorText = useErrorText();
  const save = useSaveCartAsDraft(scope);
  const load = useLoadLatestDraft(scope);
  const busy = save.isPending || load.isPending;
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("conflictTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("conflictDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("decideLater")}</AlertDialogCancel>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              load.mutate(undefined, {
                onSuccess: (draft) => {
                  toast.success(draft && draft.state === "OPEN" ? t("latestLoaded") : t("draftGoneUnlinked"));
                  onOpenChange(false);
                  onResolved?.();
                },
                onError: (e) => toast.error(errorText(e)),
              })
            }
          >
            {load.isPending && <Spinner data-icon="inline-start" />}
            {t("loadLatest")}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              save.mutate(
                { asNew: true },
                {
                  onSuccess: () => {
                    toast.success(t("savedAsNew"));
                    onOpenChange(false);
                    onResolved?.();
                  },
                  onError: (e) => toast.error(errorText(e)),
                },
              )
            }
          >
            {save.isPending && <Spinner data-icon="inline-start" />}
            {t("keepMineAsNew")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
