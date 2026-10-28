import { useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Check, MapPin } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
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
  type Address,
  type Contact,
  type InstructionsMode,
  type Order,
  type ReviewedCheckout,
  type UnavailableReviewLine,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/field';
import { cartStore, useCart } from '@/lib/cart';
import { useErrorText, useT } from '@/lib/i18n';
import { sessionStore, useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { isDraftConflict, useSaveCartAsDraft } from '@/features/buyer-catalogue/cart-actions';
import { Notice, OptionRow } from '@/features/buyer-catalogue/components';
import { DraftConflictPanel } from '@/features/buyer-catalogue/draft-conflict';
import { useActiveLocations } from '@/features/buyer-catalogue/queries';
import { useVendorContext } from '@/features/buyer-catalogue/vendor-context';

const MODES: InstructionsMode[] = ['INHERIT', 'OVERRIDE', 'CLEAR'];
const formatAddress = (a: Address) => [a.line1, a.line2, `${a.postalCode} ${a.city}`].filter(Boolean).join(', ');

/** Two checkout steps; the second exists only while a review receipt is held. */
function CheckoutSteps({ current }: { current: 1 | 2 }) {
  const c = useTokenColors();
  const t = useT('checkout');
  const steps = [t('step.details'), t('step.review')];
  return (
    <View className="flex-row items-center gap-2" accessibilityLabel={t('steps')}>
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <View key={label} className="flex-row items-center gap-2" accessibilityState={{ selected: active }}>
            {i > 0 && <View className={`h-px w-6 ${done || active ? 'bg-primary' : 'bg-border'}`} />}
            <View
              className={`size-7 items-center justify-center rounded-full border ${active ? 'border-primary bg-primary' : done ? 'border-primary' : 'border-border'}`}>
              {done ? (
                <Check size={16} color={c.primary} />
              ) : (
                <AppText weight="medium" className={`text-xs ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                  {String(n)}
                </AppText>
              )}
            </View>
            <AppText weight={active ? 'medium' : undefined} className={`text-sm ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
              {label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Checkout on mobile — same two steps as web: details → POST /order-reviews (exact receipt) →
 * review step with the explicit submission (direct order with a per-receipt Idempotency-Key, or
 * the linked draft's submission). Android back on the review step returns to the details.
 */
export function CheckoutScreen() {
  const c = useTokenColors();
  const t = useT('checkout');
  const tmo = useT('mCheckout');
  const errorText = useErrorText();
  const qc = useQueryClient();
  const business = useBusiness();
  const vendor = useVendorContext();
  const cart = useCart();
  const locations = useActiveLocations();
  const save = useSaveCartAsDraft(cart.scope);
  const scroll = useRef<ScrollView>(null);
  const [contactOn, setContactOn] = useState(cart.state.contactOverride !== null);
  const [contact, setContact] = useState<Contact>(cart.state.contactOverride ?? { name: '', phone: '', email: null });
  const [reviewed, setReviewed] = useState<ReviewedCheckout | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [unavailable, setUnavailable] = useState<UnavailableReviewLine[]>([]);
  const [busy, setBusy] = useState<'review' | 'submit' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const state = cart.state;
  const scope = cart.scope;
  const pending = state.pendingSubmission;
  const canSubmit = canSubmitOrders(business);
  const step = reviewed ? 2 : 1;

  const backToDetails = () => {
    setReviewed(null);
    setChanged(new Set());
    setError(null);
  };

  // Each step starts at the top, so the review is never left below the fold.
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  // On the review step, Android back returns to the details instead of leaving checkout.
  useEffect(() => {
    if (step !== 2 || busy !== null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      backToDetails();
      return true;
    });
    return () => sub.remove();
  }, [step, busy]);

  useEffect(() => {
    if (!locations.data || !scope) return;
    if (!locations.data.some((l) => l.id === state.deliveryLocationId) && locations.data.length > 0) {
      cartStore.updateDetails(scope, { deliveryLocationId: locations.data[0]!.id });
    }
  }, [locations.data, scope, state.deliveryLocationId]);

  if (vendor.isPending || locations.isPending) return <LoadingState label={tmo('preparing')} />;
  if (vendor.error) return <ErrorState error={vendor.error} onRetry={() => void vendor.refetch()} />;
  if (locations.isError) return <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />;
  if (!scope || (state.lines.length === 0 && !pending)) return <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />;

  const location = locations.data.find((l) => l.id === state.deliveryLocationId) ?? null;
  const editDetails = (patch: Parameters<typeof cart.updateDetails>[0]) => {
    setReviewed(null);
    cart.updateDetails(patch);
  };
  const editContact = (next: Contact) => {
    setContact(next);
    setReviewed(null);
  };
  const contactValid = !contactOn || (contact.name.trim() !== '' && contact.phone.trim().length >= 3);
  const overrideValid = state.instructionsMode !== 'OVERRIDE' || !!state.instructionsOverride?.trim();
  const expired = reviewed ? Date.parse(reviewed.review.expiresAt) <= now : false;

  const succeeded = (order: Order) => {
    void qc.invalidateQueries({ queryKey: orderKeys.all });
    void qc.invalidateQueries({ queryKey: draftKeys.all });
    void qc.invalidateQueries({ queryKey: offerKeys.all });
    router.replace({ pathname: '/buyer/order/[id]', params: { id: order.id } });
  };
  const failed = (e: unknown, during: 'review' | 'submit') => {
    if ((during === 'review' && state.draft && isDraftConflict(e) && isApiError(e, 'REVISION_CONFLICT')) || (during === 'submit' && isApiError(e, 'REVISION_CONFLICT'))) {
      setConflict(true);
      return;
    }
    scroll.current?.scrollTo({ y: 0, animated: true });
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
    if (isApiError(e, 'FORBIDDEN')) void sessionStore.refresh();
    setUncertain(isUncertainOutcome(e) || isApiError(e, 'REQUEST_IN_PROGRESS'));
    setError(e);
  };
  const review = async () => {
    cart.updateDetails({ contactOverride: contactOn ? { name: contact.name.trim(), phone: contact.phone.trim(), email: contact.email?.trim() || null } : null });
    setBusy('review');
    setError(null);
    setUnavailable([]);
    setChanged(new Set());
    try {
      setReviewed(await prepareReview(cartStore, scope));
    } catch (e) {
      failed(e, 'review');
    } finally {
      setBusy(null);
    }
  };
  const submit = async (retry: boolean) => {
    setBusy('submit');
    setError(null);
    setUncertain(false);
    try {
      succeeded(retry ? await retryPendingSubmission(cartStore, scope) : await submitReviewed(cartStore, scope, reviewed!));
    } catch (e) {
      failed(e, 'submit');
    } finally {
      setBusy(null);
    }
  };
  const nameOf = (productId: string | null) => (productId ? state.lines.find((l) => l.productId === productId)?.snapshot?.name ?? t('aProduct') : '');
  const errorDescription = error instanceof IncompleteIntentError ? t('incomplete') : error ? errorText(error) : null;

  return (
    <ScrollView ref={scroll} className="flex-1 bg-background" contentContainerClassName="gap-4 p-4 pb-12" keyboardShouldPersistTaps="handled">
      {vendor.active && <AppText className="text-sm text-muted-foreground">{t('orderFrom', { vendor: vendor.active.displayName })}</AppText>}
      <CheckoutSteps current={step} />
      {pending && (
        <View accessibilityRole="alert" className="gap-2 rounded-lg border border-border bg-card p-3">
          <AppText weight="medium" className="text-sm text-foreground">{t('pendingTitle')}</AppText>
          <AppText className="text-sm text-muted-foreground">{t('pendingDescription')}</AppText>
          <Button size="sm" loading={busy === 'submit'} disabled={busy !== null} onPress={() => void submit(true)}>
            {t('pendingCheck')}
          </Button>
        </View>
      )}
      {state.draft && <AppText className="text-sm text-muted-foreground">{t('viaDraft')}</AppText>}
      {conflict && <DraftConflictPanel scope={scope} onDone={(text) => { setConflict(false); setReviewed(null); if (text) setNotice(text); }} />}
      {notice && <Notice text={notice} />}
      {errorDescription && (
        <View accessibilityRole="alert" className="gap-1 rounded-lg border border-border bg-card p-3">
          <AppText weight="medium" className={`text-sm ${uncertain ? 'text-foreground' : 'text-destructive'}`}>
            {uncertain ? t('uncertainTitle') : termsChange(error) ? t('termsChangedTitle') : t('problemTitle')}
          </AppText>
          <AppText className="text-sm text-muted-foreground">{uncertain ? t('uncertainDescription') : errorDescription}</AppText>
          {unavailable.map((u) => (
            <AppText key={u.path} className="text-sm text-muted-foreground">{`• ${t(`issue.${u.code}`, { product: nameOf(u.productId) })}`}</AppText>
          ))}
          {isApiError(error, 'FORBIDDEN') && <AppText className="text-sm text-muted-foreground">{t('staffRestricted')}</AppText>}
        </View>
      )}

      {!reviewed ? (
        <>
          <Card>
            <CardHeader title={t('deliveryLocation')} />
            {locations.data.length === 0 ? (
              <AppText className="text-sm text-muted-foreground">{t('noLocations')}</AppText>
            ) : (
              <View className="overflow-hidden rounded-lg border border-border" accessibilityRole="radiogroup">
                {locations.data.map((l, i) => (
                  <View key={l.id}>
                    {i > 0 && <View className="h-px bg-border" />}
                    <OptionRow
                      icon={<MapPin size={18} color={c['muted-foreground']} />}
                      title={l.name}
                      subtitle={formatAddress(l.address)}
                      selected={l.id === state.deliveryLocationId}
                      onPress={() => editDetails({ deliveryLocationId: l.id })}
                    />
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card>
            <CardHeader title={t('detailsTitle')} description={t('detailsDescription')} />
            <Chip label={t('contactOverride')} selected={contactOn} onPress={() => { setContactOn(!contactOn); setReviewed(null); }} />
            {!contactOn && location && (
              <AppText className="text-sm text-muted-foreground">
                {location.contact ? t('contactInherited', { name: location.contact.name, phone: location.contact.phone }) : t('contactFromOrganization')}
              </AppText>
            )}
            {contactOn && (
              <View className="gap-3">
                <Field label={t('contactName')}>
                  <Input value={contact.name} maxLength={100} onChangeText={(v) => editContact({ ...contact, name: v })} />
                </Field>
                <Field label={t('contactPhone')}>
                  <Input value={contact.phone} maxLength={30} keyboardType="phone-pad" onChangeText={(v) => editContact({ ...contact, phone: v.replace(/[^+0-9 ()-]/g, '') })} />
                </Field>
                <Field label={t('contactEmail')}>
                  <Input value={contact.email ?? ''} maxLength={254} keyboardType="email-address" autoCapitalize="none" onChangeText={(v) => editContact({ ...contact, email: v || null })} />
                </Field>
              </View>
            )}
            <Field label={t('instructions')}>
              <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
                {MODES.map((m) => (
                  <Chip key={m} role="radio" label={t(`instructionsMode.${m}`)} selected={state.instructionsMode === m} onPress={() => editDetails({ instructionsMode: m })} />
                ))}
              </View>
            </Field>
            {state.instructionsMode === 'INHERIT' && (
              <AppText className="text-sm text-muted-foreground">{location?.instructions ? t('instructionsInherited', { text: location.instructions }) : t('instructionsNone')}</AppText>
            )}
            {state.instructionsMode === 'OVERRIDE' && (
              <Input
                accessibilityLabel={t('instructionsText')}
                multiline
                maxLength={1000}
                className="h-24 py-2"
                value={state.instructionsOverride ?? ''}
                onChangeText={(v) => editDetails({ instructionsOverride: v })}
              />
            )}
            <Field label={t('note')} description={t('noteHint')}>
              <Input multiline maxLength={1000} className="h-20 py-2" value={state.note ?? ''} onChangeText={(v) => editDetails({ note: v })} />
            </Field>
            {state.replacementForOrderId && (
              <View className="gap-2">
                <AppText className="text-sm text-muted-foreground">{t('replacementFor')}</AppText>
                <Button size="sm" variant="ghost" onPress={() => editDetails({ replacementForOrderId: null })}>
                  {t('notReplacement')}
                </Button>
              </View>
            )}
          </Card>

          {!canSubmit && <AppText className="text-sm text-muted-foreground">{t('staffRestricted')}</AppText>}
          <AppText className="text-sm text-muted-foreground">{t('reviewFirst', { count: state.lines.length, countText: formatNumber(state.lines.length) })}</AppText>
          <Button
            loading={busy === 'review'}
            disabled={busy !== null || !location || !contactValid || !overrideValid || state.lines.length === 0 || !!pending}
            onPress={() => void review()}>
            {t('review')}
          </Button>
        </>
      ) : (
        <>
          <Card>
            <CardHeader
              title={t('receiptTitle')}
              description={expired ? t('receiptExpired') : t('receiptValidUntil', { time: formatDateTime(reviewed.review.expiresAt) })}
            />
            {reviewed.review.lines.map((l) => (
              <View key={l.productId} className={`gap-1 ${changed.has(l.productId) ? 'rounded-md bg-muted p-2' : ''}`}>
                <View className="flex-row justify-between gap-3">
                  <AppText className="flex-1 text-sm text-foreground" numberOfLines={2}>{`${formatNumber(l.quantity)} ${l.unitName} × ${l.name}`}</AppText>
                  <AppText mono className="text-sm text-foreground">{formatMoney(l.price.lineTotal, reviewed.review.currency)}</AppText>
                </View>
                <View className="flex-row flex-wrap items-center gap-1">
                  <AppText mono className="text-xs text-muted-foreground">{formatMoney(l.price.finalUnitPrice, reviewed.review.currency)}</AppText>
                  {changed.has(l.productId) && <Badge variant="warning">{t('changed')}</Badge>}
                  {l.price.appliedPromotion && <Badge variant="success">{l.price.appliedPromotion.name}</Badge>}
                  {!l.price.appliedPromotion && l.price.agreedUnitPrice !== null && <Badge variant="brand">{t('agreedPrice')}</Badge>}
                </View>
              </View>
            ))}
            <View className="h-px bg-border" />
            <View className="flex-row justify-between">
              <AppText weight="semibold" className="text-base text-foreground">{t('goodsTotal')}</AppText>
              <AppText mono weight="semibold" className="text-base text-foreground">{formatMoney(reviewed.review.goodsTotal, reviewed.review.currency)}</AppText>
            </View>
            <AppText className="text-xs text-muted-foreground">{t('netNote')}</AppText>
          </Card>

          <Card>
            <CardHeader title={t('deliverySummary')} />
            <AppText className="text-sm text-muted-foreground">{`${t('deliverTo')}: ${formatAddress(reviewed.review.deliveryAddress)}`}</AppText>
            <AppText className="text-sm text-muted-foreground">
              {`${t('contact')}: ${reviewed.review.deliveryContact.name} · ${reviewed.review.deliveryContact.phone}${reviewed.review.deliveryContact.email ? ` · ${reviewed.review.deliveryContact.email}` : ''}`}
            </AppText>
            <AppText className="text-sm text-muted-foreground">{`${t('instructions')}: ${reviewed.review.deliveryInstructions ?? t('instructionsNone')}`}</AppText>
            {reviewed.review.intent.note && <AppText className="text-sm text-muted-foreground">{`${t('noteTitle')}: ${reviewed.review.intent.note}`}</AppText>}
            {reviewed.review.intent.replacementForOrderId && <AppText className="text-sm text-muted-foreground">{t('replacementFor')}</AppText>}
            <Button size="sm" variant="outline" disabled={busy !== null} onPress={backToDetails}>
              {t('editDetails')}
            </Button>
          </Card>

          {!canSubmit && <AppText className="text-sm text-muted-foreground">{t('staffRestricted')}</AppText>}
          {expired && (
            <Button loading={busy === 'review'} disabled={busy !== null || !!pending} onPress={() => void review()}>
              {t('reviewAgain')}
            </Button>
          )}
          {!expired && canSubmit && (
            <Button loading={busy === 'submit'} disabled={busy !== null || !!pending} onPress={() => void submit(false)}>
              {changed.size > 0 ? t('confirmChanged') : t('placeOrder')}
            </Button>
          )}
        </>
      )}

      {!canSubmit && (
        <Button
          variant="outline"
          loading={save.isPending}
          onPress={() =>
            save.mutate({}, { onSuccess: () => setNotice(t('savedForTeam')), onError: (e) => (isDraftConflict(e) ? setConflict(true) : setError(e)) })
          }>
          {state.draft ? t('updateDraft') : t('saveAsDraft')}
        </Button>
      )}
      <AppText className="text-xs text-muted-foreground">{t('noPayment')}</AppText>
    </ScrollView>
  );
}
