# Orders area (agent D1): backend gaps, contract decisions, limitations

Scope: order lists and detail on both sides (web and mobile), vendor lifecycle actions, cancellation requests, the event timeline, the message thread, custom order stages (`/vendor/settings/stages`, mobile `vendor/stages`), and the buyer reorder and replacement entry points. Shared logic lives in `packages/core/queries/orders.ts`, with tests in `orders.test.ts`.

## Crucial backend gaps

1. **There is no partner directory with names** (`listRelationships` returns only IDs; `GET /partners/{organizationId}` returns one partner per call). Several UI parts need partner names:
   - the partner filter on both order lists;
   - the link from an order to its relationship page;
   - the read-only thread detection.

   To get them, `orderQueries.partners()` lists every relationship page and then reads each partner, one request per partner, cached for 5 minutes. This works at pilot scale, but it is N+1 requests. Needed: a paged partner list that includes `displayName`, `relationshipId` and `relationshipState` (or names on `Relationship`).
2. **There is no "replaced by" link on a cancelled order.** `Order.replacementForOrderId` only points backward, so a cancelled order cannot show its successor, and the UI can offer "Order a replacement" even when one was already submitted. The backend rejects the duplicate at review with 409 `INVALID_STATE`. Needed: `replacedByOrderId` (or equivalent) on `Order`.
3. **Order snapshots have no delivery location name or ID.** `Order` freezes the address, contact and instructions, but not the buyer location's name. Lists and details therefore show "line1, city", and buyers cannot filter their history by delivery location (the old UI did). Needed: a frozen `deliveryLocation {id, name}` and/or a `deliveryLocationId` filter on `GET /orders`.
4. **The relationship state is not on the order.** The contract makes threads of disconnected terminal orders read-only. The UI infers this from the partner read (`relationshipState`). If that read fails, the composer stays enabled and the backend returns 409 `INVALID_STATE`, which is shown.
5. **Messages have no unread or read state.** The thread polls every 60 s while open. There is no unread count for the order lists.

## Contract ambiguities, resolved as follows

- **Event kinds:** derived in `orderEventKind()` and checked against live events for every transition:
  - The first event has `previousState: null`.
  - Cancellation-request events carry `cancellationRequestState`: PENDING, REJECTED (declined), WITHDRAWN, APPROVED (the order becomes CANCELLED), or RESOLVED (the vendor cancelled directly while a request was pending).
  - Stage changes keep the ACCEPTED state and change `stageId`.
  - `reason` holds the request, decline, rejection or cancellation reason.
- **Allowed actions:** shown with `orderActions()` per the contract.
  - Vendor: accept or reject while AWAITING; set the stage, dispatch, or cancel while ACCEPTED; dispatch is hidden or disabled while a request is pending; deliver while DISPATCHED.
  - Buyer: cancel while AWAITING; request, or withdraw, a cancellation while ACCEPTED; replacement only for CANCELLED orders. The buyer-wide `Organization.staffSubmissionRestricted` hides these controls from restricted STAFF.
  - The backend still decides every action.
- **Retries and conflicts:**
  - After an uncertain outcome, the cached order is kept unchanged, so a retry sends the exact same `expectedRevision` and body; the backend replays.
  - After a definite failure, the order is refetched.
  - Live check: re-sending a completed action with a different revision returns 409 `IDEMPOTENCY_MISMATCH`.
  - Messages keep their UUIDv4 key only for retrying the identical text.
  - Stage creation keeps its UUIDv7 only for retrying the identical name.
- **Stage revisions:** reordering changes each stage's `revision`. Live check: a retire with a pre-reorder stage revision returned 409 `REVISION_CONFLICT`. The screens therefore always use the list returned by the reorder or a refetched list.
- **Dates:** date presets are inclusive and country-local (`orderDateRange` uses `localToday()`). Reversed custom ranges are blocked on the client; the backend would return 422.
- **Line price explanation:** the UI shows the final unit price, with the strikethrough pre-promotion price (`agreedUnitPrice ?? normalUnitPrice`). Labels mark an agreed price, a promotion (percent or fixed), or a volume tier. The base price is shown when it differs. No tax is calculated, and every amount is labelled net, excluding VAT.
- **Reorder:** "Reorder" uses the read-only preview and agent C's `useReorderIntoCart` on web (merge or replace when the cart is not empty). On mobile, where C's hook is not yet exported, it uses core `reorderPlan`/`applyReorder` with the mobile `cartStore`.
- **Replacement:** "Order a replacement" does the same as reorder, then sets the cart's `replacementForOrderId`, which checkout (agent C) sends in the review intent.

## Operations without a dedicated UI

- `GET /orders/{id}/cancellation-requests/{requestId}` is used only for the pending request. Past requests appear in the timeline through their events.
- Admin support reads (`adminReadOrder`, `adminReadMessages`) belong to agent E.

## Local test limitations

- Every operation was exercised live with native bearer calls against the synthetic backend (two backend instances; the scenario and stage scripts are in the session scratchpad):
  - direct submission and review;
  - accept with and without a fulfillment location;
  - set and clear the stage;
  - cancellation request: create, get, decline, withdraw, approve;
  - dispatch is blocked while a request is pending (409 `INVALID_STATE`);
  - dispatch, deliver, reject;
  - buyer cancel, and vendor cancel with a pending request (RESOLVED);
  - events and messages from both sides, including message key replay (201, same ID) and key mismatch (409 `IDEMPOTENCY_MISMATCH`);
  - reorder preview;
  - filtered and cursor-paged lists;
  - reversed range (422);
  - stages: list, create, replay, `DUPLICATE_NAME`, reserved label (422), rename, stale rename (409), reorder, retire;
  - partner reads.
- Screens were not run in a browser or simulator (the brief forbids dev servers). The browser transport (cookies and CSRF) was not exercised for these operations.
- Expo typed routes do not yet include `vendor/stages` (new) or `buyer/vendor/[id]` (agent D2). Those two `router.push` calls cast to `Href` until the next `expo start` regenerates the route types.

## Notes for other agents

- Agent A (shell): link `/vendor/settings/stages` in the vendor settings navigation. The page renders only its card, so a settings layout or header should wrap it. On mobile, add a link to `vendor/stages`; it is also reachable from the vendor order detail through "Manage stages".
- Agent D2: `features/orders/status-badge`, `status-tracker` and web/mobile `features/vendor-orders/queries.ts` are deleted; the vendor dashboard, stats and buyer screens imported them. Use `orderStateTone()`, `ORDER_STATES` and `orderQueries` from `@repo/core`, and the `ordState` i18n namespace, for state labels.
- Agent C: `orders.deliveryLocation` and `orders.chooseLocation` are kept for `location-select.tsx`. Mobile `@/lib/cart` does not export `useReorderIntoCart` yet, so mobile reorder uses the core functions directly.

## Core change requests

- None required. `i18n-index.mjs` fails while any agent has an English-only namespace. I regenerated `resources.gen.ts` with a tolerant copy that skips incomplete namespaces; rerun the real script once all namespaces are complete.
