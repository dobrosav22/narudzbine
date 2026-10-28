"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, CheckIcon, ClockIcon, FileClockIcon, ShoppingCartIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  canSubmitOrders,
  changedReviewLines,
  draftKeys,
  formatDateTime,
  formatMoney,
  formatNumber,
  IncompleteIntentError,
  isApiError,
  isUncertainOutcome,
  offerKeys,
  orderKeys,
  prepareReview,
  retryPendingSubmission,
  submitReviewed,
  termsChange,
  type Contact,
  type InstructionsMode,
  type Order,
  type ReviewedCheckout,
  type UnavailableReviewLine,
} from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cartStore, useCart } from "@/lib/cart";
import { useErrorText } from "@/lib/i18n";
import { sessionStore, useBusiness } from "@/lib/session";
import { cn } from "@/lib/utils";
import { isDraftConflict, useSaveCartAsDraft } from "@/features/buyer-catalogue/cart-actions";
import { DraftConflictDialog } from "@/features/buyer-catalogue/draft-conflict";
import { useActiveLocations } from "@/features/buyer-catalogue/queries";
import { useVendorContext } from "@/features/buyer-catalogue/vendor-context";
import { formatAddress, LocationSelect } from "./location-select";

const MODES: InstructionsMode[] = ["INHERIT", "OVERRIDE", "CLEAR"];

/** Ticks so the receipt notices its own expiry. */
function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Two checkout steps; the second exists only while a review receipt is held. */
function CheckoutSteps({ current }: { current: 1 | 2 }) {
  const t = useTranslations("checkout");
  const steps = [t("step.details"), t("step.review")];
  return (
    <ol className="flex items-center gap-3" aria-label={t("steps")}>
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
            {i > 0 && <span aria-hidden className={cn("h-px w-8 sm:w-16", done || active ? "bg-primary" : "bg-border")} />}
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                active && "border-primary bg-primary text-primary-foreground",
                done && "border-primary text-primary",
                !active && !done && "border-border text-muted-foreground",
              )}
            >
              {done ? <CheckIcon className="size-4" /> : n}
            </span>
            <span className={cn("text-sm", active ? "font-medium" : "text-muted-foreground")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Checkout in two steps. Step 1: delivery details. "Review order" calls POST /order-reviews
 * (exact receipt, 15 minutes) and moves to step 2, which shows only the receipt and the explicit
 * submission. Direct orders use POST /orders with an Idempotency-Key kept per receipt; a cart
 * linked to a shared draft submits through POST /drafts/{id}/submission and consumes the draft.
 * Changed terms always need explicit reconfirmation; nothing is submitted automatically.
 */
export function CheckoutScreen() {
  const t = useTranslations("checkout");
  const errorText = useErrorText();
  const router = useRouter();
  const qc = useQueryClient();
  const business = useBusiness();
  const vendor = useVendorContext();
  const cart = useCart();
  const locations = useActiveLocations();
  const save = useSaveCartAsDraft(cart.scope);
  const now = useNow();

  const [contactOn, setContactOn] = useState(cart.state.contactOverride !== null);
  const [contact, setContact] = useState<Contact>(cart.state.contactOverride ?? { name: "", phone: "", email: null });
  const [reviewed, setReviewed] = useState<ReviewedCheckout | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [unavailable, setUnavailable] = useState<UnavailableReviewLine[]>([]);
  const [busy, setBusy] = useState<"review" | "submit" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);

  const canSubmit = canSubmitOrders(business);
  const state = cart.state;
  const scope = cart.scope;
  const pending = state.pendingSubmission;
  const step = reviewed ? 2 : 1;

  // Each step starts at the top, so the review is never left below the fold.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  // Default the delivery location to the only/first active one; drop an archived choice.
  useEffect(() => {
    if (!locations.data || !scope) return;
    const valid = locations.data.some((l) => l.id === state.deliveryLocationId);
    if (!valid && locations.data.length > 0) cartStore.updateDetails(scope, { deliveryLocationId: locations.data[0]!.id });
  }, [locations.data, scope, state.deliveryLocationId]);

  if (vendor.isPending || locations.isPending) return <RowsSkeleton rows={6} />;
  if (vendor.error) return <ErrorState error={vendor.error} onRetry={() => void vendor.refetch()} />;
  if (locations.isError) return <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />;
  if (!scope || (state.lines.length === 0 && !pending)) {
    return (
      <EmptyState icon={ShoppingCartIcon} title={t("emptyTitle")} description={t("emptyDescription")}>
        <Button asChild variant="outline">
          <Link href="/buyer">{t("browse")}</Link>
        </Button>
      </EmptyState>
    );
  }

  const location = locations.data.find((l) => l.id === state.deliveryLocationId) ?? null;
  const editDetails = (patch: Parameters<typeof cart.updateDetails>[0]) => {
    setReviewed(null);
    cart.updateDetails(patch);
  };
  const contactValid = !contactOn || (contact.name.trim() !== "" && contact.phone.trim().length >= 3);
  const overrideValid = state.instructionsMode !== "OVERRIDE" || !!state.instructionsOverride?.trim();
  const expired = reviewed ? Date.parse(reviewed.review.expiresAt) <= now : false;

  const succeeded = (order: Order) => {
    void qc.invalidateQueries({ queryKey: orderKeys.all });
    void qc.invalidateQueries({ queryKey: draftKeys.all });
    void qc.invalidateQueries({ queryKey: offerKeys.all });
    toast.success(t("placedToast", { number: order.number }));
    router.replace(`/buyer/orders/${order.id}`);
  };

  const failed = (e: unknown, during: "review" | "submit") => {
    if (during === "review" && state.draft && isDraftConflict(e) && isApiError(e, "REVISION_CONFLICT")) return setConflict(true);
    if (during === "submit" && isApiError(e, "REVISION_CONFLICT")) return setConflict(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    const terms = termsChange(e);
    if (terms && reviewed) {
      if (terms.currentTerms) {
        setChanged(changedReviewLines(reviewed.review, terms.currentTerms));
        setReviewed({ review: terms.currentTerms, draft: reviewed.draft });
      } else {
        setUnavailable(terms.unavailableLines);
        setReviewed(null);
      }
      setError(e);
      return;
    }
    if (isApiError(e, "FORBIDDEN")) void sessionStore.refresh();
    setUncertain(isUncertainOutcome(e) || isApiError(e, "REQUEST_IN_PROGRESS"));
    setError(e);
  };

  const backToDetails = () => {
    setReviewed(null);
    setChanged(new Set());
    setError(null);
  };

  const review = async () => {
    if (!contactValid || !overrideValid) return;
    cart.updateDetails({ contactOverride: contactOn ? { name: contact.name.trim(), phone: contact.phone.trim(), email: contact.email?.trim() || null } : null });
    setBusy("review");
    setError(null);
    setUnavailable([]);
    setChanged(new Set());
    try {
      setReviewed(await prepareReview(cartStore, scope));
    } catch (e) {
      failed(e, "review");
    } finally {
      setBusy(null);
    }
  };

  const submit = async (retry: boolean) => {
    setBusy("submit");
    setError(null);
    setUncertain(false);
    try {
      succeeded(retry ? await retryPendingSubmission(cartStore, scope) : await submitReviewed(cartStore, scope, reviewed!));
    } catch (e) {
      failed(e, "submit");
    } finally {
      setBusy(null);
    }
  };

  const nameOf = (productId: string | null) =>
    productId ? state.lines.find((l) => l.productId === productId)?.snapshot?.name ?? t("aProduct") : null;
  const errorDescription = error instanceof IncompleteIntentError ? t("incomplete") : error ? errorText(error) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {step === 1 ? (
          <Button asChild variant="ghost" size="icon" aria-label={t("backToCart")}>
            <Link href="/buyer/cart">
              <ArrowLeftIcon />
            </Link>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label={t("editDetails")} disabled={busy !== null} onClick={backToDetails}>
            <ArrowLeftIcon />
          </Button>
        )}
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          {vendor.active && <p className="text-sm text-muted-foreground">{t("orderFrom", { vendor: vendor.active.displayName })}</p>}
        </div>
      </div>

      <CheckoutSteps current={step} />

      {pending && (
        <Alert>
          <FileClockIcon />
          <AlertTitle>{t("pendingTitle")}</AlertTitle>
          <AlertDescription>{t("pendingDescription")}</AlertDescription>
          <AlertAction>
            <Button size="sm" disabled={busy !== null} onClick={() => void submit(true)}>
              {busy === "submit" && <Spinner data-icon="inline-start" />}
              {t("pendingCheck")}
            </Button>
          </AlertAction>
        </Alert>
      )}

      {state.draft && <p className="text-sm text-muted-foreground">{t("viaDraft")}</p>}

      {errorDescription && (
        <Alert variant={uncertain ? "default" : "destructive"}>
          <TriangleAlertIcon />
          <AlertTitle>{uncertain ? t("uncertainTitle") : termsChange(error) ? t("termsChangedTitle") : t("problemTitle")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>{uncertain ? t("uncertainDescription") : errorDescription}</p>
            {unavailable.length > 0 && (
              <ul className="list-disc pl-4">
                {unavailable.map((u) => (
                  <li key={u.path}>{t(`issue.${u.code}`, { product: nameOf(u.productId) ?? "" })}</li>
                ))}
              </ul>
            )}
            {isApiError(error, "FORBIDDEN") && <p>{t("staffRestricted")}</p>}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {!reviewed ? (
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("deliveryLocation")}</CardTitle>
              </CardHeader>
              <CardContent>
                <LocationSelect locations={locations.data} value={state.deliveryLocationId} onChange={(id) => editDetails({ deliveryLocationId: id })} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("detailsTitle")}</CardTitle>
                <CardDescription>{t("detailsDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field orientation="horizontal">
                    <Switch
                      id="contact-override"
                      checked={contactOn}
                      onCheckedChange={(on) => {
                        setContactOn(on);
                        setReviewed(null);
                      }}
                    />
                    <FieldLabel htmlFor="contact-override">{t("contactOverride")}</FieldLabel>
                  </Field>
                  {!contactOn && location && (
                    <FieldDescription>
                      {location.contact ? t("contactInherited", { name: location.contact.name, phone: location.contact.phone }) : t("contactFromOrganization")}
                    </FieldDescription>
                  )}
                  {contactOn && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field>
                        <FieldLabel htmlFor="contact-name">{t("contactName")}</FieldLabel>
                        <Input id="contact-name" maxLength={100} value={contact.name} aria-invalid={!contact.name.trim() || undefined} onChange={(e) => { setContact({ ...contact, name: e.target.value }); setReviewed(null); }} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="contact-phone">{t("contactPhone")}</FieldLabel>
                        <Input id="contact-phone" type="tel" maxLength={30} value={contact.phone} aria-invalid={contact.phone.trim().length < 3 || undefined} onChange={(e) => { setContact({ ...contact, phone: e.target.value.replace(/[^+0-9 ()-]/g, "") }); setReviewed(null); }} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="contact-email">{t("contactEmail")}</FieldLabel>
                        <Input id="contact-email" type="email" maxLength={254} value={contact.email ?? ""} onChange={(e) => { setContact({ ...contact, email: e.target.value || null }); setReviewed(null); }} />
                      </Field>
                    </div>
                  )}

                  <Field>
                    <FieldLabel>{t("instructions")}</FieldLabel>
                    <RadioGroup value={state.instructionsMode} onValueChange={(m) => editDetails({ instructionsMode: m as InstructionsMode })}>
                      {MODES.map((m) => (
                        <Field key={m} orientation="horizontal">
                          <RadioGroupItem value={m} id={`mode-${m}`} />
                          <FieldLabel htmlFor={`mode-${m}`} className="font-normal">
                            {t(`instructionsMode.${m}`)}
                          </FieldLabel>
                        </Field>
                      ))}
                    </RadioGroup>
                    {state.instructionsMode === "INHERIT" && (
                      <FieldDescription>{location?.instructions ? t("instructionsInherited", { text: location.instructions }) : t("instructionsNone")}</FieldDescription>
                    )}
                    {state.instructionsMode === "OVERRIDE" && (
                      <Textarea
                        aria-label={t("instructionsText")}
                        maxLength={1000}
                        value={state.instructionsOverride ?? ""}
                        aria-invalid={!overrideValid || undefined}
                        onChange={(e) => editDetails({ instructionsOverride: e.target.value })}
                      />
                    )}
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="order-note">{t("note")}</FieldLabel>
                    <Textarea id="order-note" maxLength={1000} value={state.note ?? ""} onChange={(e) => editDetails({ note: e.target.value })} />
                    <FieldDescription>{t("noteHint")}</FieldDescription>
                  </Field>

                  {state.replacementForOrderId && (
                    <Field orientation="horizontal">
                      <FieldDescription className="flex-1">{t("replacementFor")}</FieldDescription>
                      <Button size="sm" variant="ghost" onClick={() => editDetails({ replacementForOrderId: null })}>
                        {t("notReplacement")}
                      </Button>
                    </Field>
                  )}
                </FieldGroup>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("receiptTitle")}</CardTitle>
                <CardDescription className="flex items-center gap-1">
                  <ClockIcon className="size-3.5" />
                  {expired ? t("receiptExpired") : t("receiptValidUntil", { time: formatDateTime(reviewed.review.expiresAt) })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("product")}</TableHead>
                      <TableHead className="text-right">{t("qty")}</TableHead>
                      <TableHead className="text-right">{t("unitPrice")}</TableHead>
                      <TableHead className="text-right">{t("lineTotal")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviewed.review.lines.map((l) => (
                      <TableRow key={l.productId} data-state={changed.has(l.productId) ? "selected" : undefined}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{l.name}</span>
                            <span className="text-xs text-muted-foreground">
                              <span className="font-mono">{l.sku}</span>
                              {l.packDescription && ` · ${l.packDescription}`}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {changed.has(l.productId) && <Badge variant="warning">{t("changed")}</Badge>}
                              {l.price.appliedPromotion && <Badge variant="success">{l.price.appliedPromotion.name}</Badge>}
                              {!l.price.appliedPromotion && l.price.agreedUnitPrice !== null && <Badge variant="brand">{t("agreedPrice")}</Badge>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatNumber(l.quantity)} {l.unitName}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatMoney(l.price.finalUnitPrice, reviewed.review.currency)}
                          {l.price.finalUnitPrice !== l.price.baseUnitPrice && (
                            <span className="block text-xs text-muted-foreground line-through">{formatMoney(l.price.baseUnitPrice, reviewed.review.currency)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatMoney(l.price.lineTotal, reviewed.review.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("deliverySummary")}</CardTitle>
                <CardAction>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={backToDetails}>
                    {t("editDetails")}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">{t("deliverTo")}</dt>
                    <dd>{formatAddress(reviewed.review.deliveryAddress)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("contact")}</dt>
                    <dd>
                      {reviewed.review.deliveryContact.name} · {reviewed.review.deliveryContact.phone}
                      {reviewed.review.deliveryContact.email && ` · ${reviewed.review.deliveryContact.email}`}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">{t("instructions")}</dt>
                    <dd>{reviewed.review.deliveryInstructions ?? t("instructionsNone")}</dd>
                  </div>
                  {reviewed.review.intent.note && (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">{t("noteTitle")}</dt>
                      <dd className="whitespace-pre-line">{reviewed.review.intent.note}</dd>
                    </div>
                  )}
                </dl>
                {reviewed.review.intent.replacementForOrderId && <p className="mt-3 text-sm text-muted-foreground">{t("replacementFor")}</p>}
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>{t("orderTotal")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {reviewed ? (
              <>
                <div className="flex justify-between text-base font-semibold">
                  <span>{t("goodsTotal")}</span>
                  <span className="font-mono tabular-nums">{formatMoney(reviewed.review.goodsTotal, reviewed.review.currency)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t("netNote")}</p>
              </>
            ) : (
              <p className="text-muted-foreground">{t("reviewFirst", { count: state.lines.length, countText: formatNumber(state.lines.length) })}</p>
            )}
            {!canSubmit && <p className="text-sm text-warning-foreground dark:text-warning">{t("staffRestricted")}</p>}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            {(!reviewed || expired) && (
              <Button
                disabled={busy !== null || !location || !contactValid || !overrideValid || state.lines.length === 0 || !!pending}
                onClick={() => void review()}
              >
                {busy === "review" && <Spinner data-icon="inline-start" />}
                {reviewed ? t("reviewAgain") : t("review")}
              </Button>
            )}
            {reviewed && !expired && canSubmit && (
              <Button disabled={busy !== null || !!pending} onClick={() => void submit(false)}>
                {busy === "submit" && <Spinner data-icon="inline-start" />}
                {changed.size > 0 ? t("confirmChanged") : t("placeOrder")}
              </Button>
            )}
            {!canSubmit && (
              <Button
                variant="outline"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(
                    {},
                    {
                      onSuccess: () => toast.success(t("savedForTeam")),
                      onError: (e) => (isDraftConflict(e) ? setConflict(true) : toast.error(errorText(e))),
                    },
                  )
                }
              >
                {save.isPending && <Spinner data-icon="inline-start" />}
                {state.draft ? t("updateDraft") : t("saveAsDraft")}
              </Button>
            )}
            {reviewed && (
              <Button variant="ghost" disabled={busy !== null} onClick={backToDetails}>
                {t("editDetails")}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">{t("noPayment")}</p>
          </CardFooter>
        </Card>
      </div>

      <DraftConflictDialog scope={scope} open={conflict} onOpenChange={setConflict} onResolved={() => setReviewed(null)} />
    </div>
  );
}
