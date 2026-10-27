"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FilesIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { cartFromDraft, formatDateTime, formatNumber, type Draft } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cartStore } from "@/lib/cart";
import { useErrorText } from "@/lib/i18n";
import { sessionStore, useBusiness } from "@/lib/session";
import { useActiveLocations, useDiscardDraft, useDrafts } from "./queries";
import { useVendorContext } from "./vendor-context";

type Resume = { draft: Draft; then: "cart" | "checkout" };

/**
 * Organization-shared saved drafts (GET /drafts, OPEN only). Anyone on the buyer team can open a
 * draft in their cart (linked: saving updates it, checkout submits and consumes it), or discard it.
 * Drafts of a vendor that is no longer connected keep their lines but cannot be ordered.
 */
export function DraftsScreen() {
  const t = useTranslations("buyDrafts");
  const errorText = useErrorText();
  const router = useRouter();
  const { organization } = useBusiness();
  const vendors = useVendorContext();
  const drafts = useDrafts();
  const locations = useActiveLocations();
  const discard = useDiscardDraft();
  const [confirmResume, setConfirmResume] = useState<Resume>();
  const [confirmDiscard, setConfirmDiscard] = useState<Draft>();

  const items = drafts.data?.pages.flatMap((p) => p.items) ?? [];
  const vendorName = (id: string) => vendors.vendors.find((v) => v.vendorId === id)?.displayName;
  const locationName = (id: string | null) => (id ? locations.data?.find((l) => l.id === id)?.name ?? t("archivedLocation") : t("noLocation"));

  const resume = async ({ draft, then }: Resume) => {
    const scope = { buyerOrgId: organization.id, vendorId: draft.intent.vendorId };
    await cartStore.hydrate(scope);
    const pending = cartStore.getState(scope).pendingSubmission;
    cartStore.replace(scope, { ...cartFromDraft(draft), pendingSubmission: pending });
    await sessionStore.selectVendor(draft.intent.vendorId);
    router.push(then === "cart" ? "/buyer/cart" : "/buyer/checkout");
  };
  const requestResume = async (r: Resume) => {
    const scope = { buyerOrgId: organization.id, vendorId: r.draft.intent.vendorId };
    await cartStore.hydrate(scope);
    const current = cartStore.getState(scope);
    if (current.lines.length > 0 && current.draft?.id !== r.draft.id) setConfirmResume(r);
    else await resume(r);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {drafts.isError ? (
        <ErrorState error={drafts.error} onRetry={() => void drafts.refetch()} />
      ) : drafts.isPending ? (
        <RowsSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState icon={FilesIcon} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((draft) => {
            const name = vendorName(draft.intent.vendorId);
            const units = draft.intent.lines.reduce((n, l) => n + l.quantity, 0);
            return (
              <Card key={draft.id} size="sm">
                <CardContent className="flex flex-wrap items-center gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{name ?? t("disconnectedVendor")}</span>
                      {!name && <Badge variant="warning">{t("notOrderable")}</Badge>}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {t("summary", {
                        count: draft.intent.lines.length,
                        countText: formatNumber(draft.intent.lines.length),
                        units: formatNumber(units),
                        location: locationName(draft.intent.deliveryLocationId),
                      })}
                    </span>
                    {draft.intent.note && <span className="text-sm">{draft.intent.note}</span>}
                    <span className="text-xs text-muted-foreground">{t("updated", { when: formatDateTime(draft.updatedAt) })}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={!name} onClick={() => void requestResume({ draft, then: "cart" })}>
                      {t("openInCart")}
                    </Button>
                    <Button size="sm" disabled={!name || draft.intent.lines.length === 0} onClick={() => void requestResume({ draft, then: "checkout" })}>
                      {t("reviewAndSubmit")}
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={t("discardAria", { vendor: name ?? t("disconnectedVendor") })} onClick={() => setConfirmDiscard(draft)}>
                      <Trash2Icon />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {drafts.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" disabled={drafts.isFetchingNextPage} onClick={() => void drafts.fetchNextPage()}>
                {drafts.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                {t("loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!confirmResume} onOpenChange={(o) => !o && setConfirmResume(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("replaceTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("replaceDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmResume && void resume(confirmResume)}>{t("replace")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDiscard} onOpenChange={(o) => !o && setConfirmDiscard(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("discardDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const draft = confirmDiscard;
                if (!draft) return;
                discard.mutate(
                  { draftId: draft.id, revision: draft.revision },
                  {
                    onSuccess: () => {
                      // A cart still linked to the discarded draft keeps its lines as new work.
                      const scope = { buyerOrgId: organization.id, vendorId: draft.intent.vendorId };
                      if (cartStore.getState(scope).draft?.id === draft.id) cartStore.linkDraft(scope, null);
                      toast.success(t("discarded"));
                    },
                    onError: (e) => toast.error(errorText(e)),
                  },
                );
              }}
            >
              {t("discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
