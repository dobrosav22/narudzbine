# Future changes

Ordering features the user selected on 2026-10-28 for later work. **Nothing here is approved for implementation yet.** These are not entries in [decisions](decisions.md) or [requirements](requirements.md), and the contract and code are unchanged. When work starts, each item first becomes recorded decisions and requirements (noting which earlier decisions it refines), then a contract change, then code. Everything below "What the user selected" is the assistant's proposed shape and open questions, not user answers.

## What the user selected

| # | Change | Required on an order? |
|---|---|---|
| F-1 | Pickup as a fulfillment option alongside delivery | Buyer picks a method only when the vendor offers more than one |
| F-2 | Requested delivery/pickup date, plus the vendor's delivery days and lead time | Optional for buyer and vendor |
| F-3 | Daily order cutoff time | Optional vendor setting |
| F-4 | Auto-accept orders | Optional vendor setting, off by default |
| F-5 | Buyer purchase-order (PO) number | Optional field |
| F-6 | Staff orders go to owner/admin for approval | Optional buyer setting |

The user's rule for all of them: **an order must still work without any of these being set.** Every new setting defaults to today's behavior, and existing organizations and orders keep working unchanged.

Frontend-only work planned separately: [web on mobile](../frontend/web-on-mobile.md), and [QA exploration](../frontend/qa-exploration.md) with its [findings register](../frontend/qa-findings.md).

Discussed but **not selected**: preset cancellation reason codes / optional buyer cancel reasons, minimum order value (explicitly rejected by D-PRI-038), and per-partner terms text. These stay unchanged unless the user brings them back.

## F-1 Pickup

**Today.** D-ORG-027 / R-ORG-027 require every order to use an active saved delivery location of the buyer's. The vendor fulfillment location is an optional reference (D-ORG-028) and doesn't express pickup.

**Proposed shape**
- Vendor setting: methods offered, `DELIVERY` and/or `PICKUP`. Default: `DELIVERY` only, which is today's behavior.
- Vendor locations get a "pickup point" flag, plus optional pickup instructions or hours as plain text.
- The order and the draft get a fulfillment method:
  - `DELIVERY` requires an active buyer delivery location, as today.
  - `PICKUP` requires an active pickup point of that vendor, and no buyer delivery location.
- The submitted snapshot (R-ORD-016) records the method and the chosen location's details. After submission it can't be amended, the same as the delivery address under D-ORD-031: to change it, cancel and resubmit.
- Core states are unchanged (D-ORD-006). Only the display labels depend on the method: "Dispatched" becomes "Ready for pickup" and "Delivered" becomes "Picked up". Stock behavior and the cancel-request block on dispatch are unchanged.

**Earlier decisions this would refine.** D-ORG-027 becomes "required for `DELIVERY` orders only". D-ORG-028 gets a defined role when the method is `PICKUP` (the pickup location becomes the vendor location on the order). D-ORG-029/030 archive and default rules also apply to pickup points.

**Open questions**
- What happens to pending drafts when a vendor stops offering pickup, or archives a pickup point? Proposed: the draft is kept, and submission fails until the buyer makes a valid choice. It never switches to another method on its own (same as R-ORG-030).
- Can the buyer have a default method per vendor?
- Are frontend translations for the method labels enough, or do outbound emails and push messages need backend resources for the new labels? Probably the backend needs them for notifications.
- Reporting: by D-STA-012/013 location doesn't affect report scope. Confirm the method doesn't either.

**Likely affected:** organizations/locations, buyer workspace drafts, order submission and snapshot, order projection, notifications, `openapi.yaml`, web/mobile ordering and order screens.

## F-2 Requested delivery/pickup date

**Today.** Doesn't exist.

**Proposed shape**
- Optional `requestedDate` (a date with no time, in the vendor's country time zone) on the draft and the order, applying to either method. It's saved in the snapshot and shown to both sides.
- Optional vendor schedule: the weekdays it delivers or offers pickup, and a minimum lead time in days. If the vendor sets no schedule, any date that isn't in the past is accepted.
- The date is checked only when the buyer supplies one. An order without a date is always valid.
- The buyer can't amend it after submission (consistent with D-ORD-031).

**Open questions**
- Can the vendor set its own planned/confirmed date, separate from the buyer's requested date, for example on acceptance? It's useful, but it adds a field and an event.
- One schedule per vendor, or one per pickup point / delivery region? Proposed: one per vendor at first.
- Holidays and closed days: not at first?
- The date's time zone: Europe/Belgrade or Europe/Sarajevo by the vendor's country. Use the injected Clock.

## F-3 Order cutoff time

**Proposed shape**
- Optional vendor daily cutoff, for example 14:00 local time. An order submitted after the cutoff counts as submitted the next day when the lead time from F-2 is calculated.
- No effect if no cutoff is set, and no effect on an order without a requested date. It never blocks submission by itself.
- It can only be built with or after F-2.

**Open questions:** Does the cutoff apply on non-delivery days? Is there a different cutoff per weekday? Proposed: neither at first.

## F-4 Auto-accept

**Today.** Every order waits for an explicit vendor accept or reject (D-ORD-001, D-ORD-015).

**Proposed shape**
- Vendor setting: auto-accept off (default) or on, with an optional override per buyer partner (on or off).
- On submission, an eligible order moves to Accepted in the same transaction. The acceptance event is attributed to the vendor's policy and its settings version, not to a person. Stock is still deducted once, at submission.
- Side effect: once accepted, the buyer can no longer cancel directly and must send a cancel request (D-ORD-004). Users need to see this clearly.

**Earlier decisions this would refine.** R-ORD-001 ("no immediate confirmation model selected") and the explicit-acceptance part of D-ORD-015.

**Open questions**
- Should notifications for auto-accepted orders differ, for example "new order" without "needs action"?
- Is auto-accept tied to a subscription plan?
- Does a change to the setting affect orders already pending? Proposed: no, it only applies to new submissions.

## F-5 Buyer PO number

**Today.** Orders have a free-text note (R-ORD-040, at most 2,000 characters) but no structured buyer reference.

**Proposed shape**
- Optional `buyerReference` on the draft and the order, at most about 100 characters, using the existing business-text normalization (D-API-051 style). It's saved in the snapshot, shown to the vendor, and can be searched or filtered in order lists.
- It isn't unique. A duplicate reference could show a warning but never blocks the order.

**Open questions:** the exact length, whether there's a duplicate warning, and whether it appears in outbound emails.

## F-6 Staff orders need approval

**Today.** The buyer-wide restriction (D-ORG-002/015, R-ORG-011, R-ORD-021) only blocks staff from submitting and cancelling. Prepared work is kept and handed to owner/admin. Nothing is ever submitted automatically.

**Proposed shape**
- The buyer setting becomes three modes: normal, restricted (today), or approval required. The default is unchanged.
- In approval mode, staff send a shared draft "for approval". The draft is locked against edits, and the vendor sees nothing. Owner/admin then:
  - **approve and submit** themselves: that is the explicit submit, with all normal checks including price reconfirmation (R-ORD-002); or
  - **return it** to staff with an optional comment; or
  - edit it and submit.
- Staff can withdraw their request. No stock is deducted until the actual submission. Changing the mode keeps all prepared work (R-ORG-011).

**Earlier decisions this would refine.** It extends D-ORG-015's handoff rather than replacing the existing restriction. It doesn't add personal permission settings: the setting is organization-wide, and roles stay fixed.

**Open questions**
- Notify all owner/admin members, or let staff choose who approves?
- Does approval mode also cover staff cancellation, or only submission?
- What happens when the approver finds changed prices: approve at the new prices, or return to staff?

## Delivery notes

- Suggested order: F-5 (smallest), F-1, F-4, F-2+F-3, F-6. Each is its own decision record, contract change, migration and tested batch, per [AI operations](../operations/ai-operations.md#implementation-cadence).
- All contract additions are nullable or optional, so existing clients keep working. All schema changes go through Flyway with the defaults above.
- Each item updates [backend handoff](../frontend/backend-handoff.md), the frontend ordering/order screens and E2E checks, under D-GOV-007.
