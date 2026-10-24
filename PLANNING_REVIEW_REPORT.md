# Independent planning review report

Current authority: P1.1 approved for backend/infrastructure implementation on 2026-10-16; VS-00 is locally verified; VS-01 is in progress. See [PROJECT_STATUS.md](PROJECT_STATUS.md). Historical candidate/authorization statements below describe the pre-approval record.
2026-10-16 — P1.1, backend and infrastructure only.

The user requested a specialized agent review rather than a manual document audit. An independent read-only specialist inspected approved requirements, design, OpenAPI, recovery operations and traceability. The primary agent checked its findings against the original decisions, corrected the package, and added a complementary session-rotation correction. A second specialist pass caught two further contract details, which were also corrected. This is a design review; no application or infrastructure was implemented.

## Findings and corrections
| ID | Priority | Concrete defect in P1.0 | P1.1 correction / verification case |
|---|---|---|---|
| REVIEW-01 | P1 | Unlink allowed generic recent authentication even through the method being removed, contradicting R-SEC-032. | Retained-method proof provenance, credential generation/epoch and account-lock validation; DESIGN_SPEC §4 / unlinkExternalIdentity. |
| REVIEW-02 | P1 | A public mailbox proof could complete a credential change hours after initial authentication; owner-transfer initiation lacked the five-minute contract condition. | Proofs only verify mailboxes. New completeEmailChange requires fresh same-account authentication, both proofs and current revision. Owner initiation explicitly checks freshness. |
| REVIEW-03 | P1 | Replenishing to the stock maximum could leave no space for an obligatory cancellation credit. | available + outstanding pre-dispatch credit quantities <=1,000,000,000, enforced on all manual/reconciliation writes; dispatch releases headroom and cancellation converts it to available once. |
| REVIEW-04 | P2 | StockDelta forbade zero despite R-CAT-083 requiring a successful no-op. | Zero accepted, original keyed success retained, unchanged initialized count preserves stock revision/history. |
| REVIEW-05 | P2 | TERMS_CHANGED did not return current terms required by R-ORD-002. | Typed currentTerms/unavailableLines, fresh receipt when valid, null plus safe issues otherwise. No order, stock deduction or draft consumption; explicit resubmission. |
| REVIEW-06 | P1 | Buyers received taxonomy/promotion IDs without usable names/effective promotion prices; relevant lookup APIs were vendor-only. | Buyer-safe named taxonomy, promotion summaries, effective prices at defined quantity and a scoped taxonomy filter route; no delivery prerequisite or target-list leak. |
| REVIEW-07 | P2 | Reconciliation arrays capped at5000 although archived products do not count against the plan cap and retain stock obligations. | Server snapshot of every vendor product, paged lines and explicit bounded acknowledgement batches, one atomic complete confirmation; no lifetime5000-product assumption. |
| REVIEW-08 | P1 | A daily archive cannot prove reconciliation of all recent acknowledged state after PITR, and independent deletion evidence lacked a write protocol. | Verified immutable external deletion intent before redaction; restored ordinary access/login/delivery stays closed if authorization/deletion/order evidence is incomplete. RTO includes reconciliation and may be missed. |
| REVIEW-09 | P2 | Session rotation on another user’s elevation did not define safe delivery of the replacement secret. | Revoke the elevated user’s sessions and require fresh login; never return their secret to the administrator. |
| REVIEW-10 | P2 | First correction bound reconciliation cursors to the acknowledgement revision; acknowledging a page invalidated its next-page cursor. | Traverse immutable snapshot/source generation; use separate mutable revision for acknowledgement/final writes. |
| REVIEW-11 | P2 | OrderReview omitted resolved inherited delivery instructions, leaving a changed-terms receipt incomplete. | Explicit nullable deliveryInstructions contains the resolved frozen value in both initial and refreshed receipts. |

## Review limits and disposition
The original user’s business rules are preserved; D-PLAN-025 records delegated corrections. Requirement/operation counts are an index, not evidence that behavior works. REVIEW-01..11 in [TRACEABILITY.md](TRACEABILITY.md) now supply concrete regression cases instead of relying on counts.

Provider assumptions remain explicit G-01..04 gates, not newly discovered provider failures. No provider sandbox, build, application security/load test or restore drill ran. External ownership, budget, domains, legal and client inputs remain X-01..06. None requires the user to manually audit every document.

Final specialist disposition: all identified findings corrected, no remaining blocker in this reviewed set; suitable for separately authorized implementation with X-01..06 and G-01..07 preserved. The specialist checked the final cursor and delivery-instruction changes after the second pass.

Structural checks passed:208 operations,204 schemas,2,949 resolved references;543 requirements/545 decisions/625 question IDs with no duplicate/unknown references or broken local links. Targeted semantic contract assertions and10,000 mathematical stock-transition reference checks passed. Application behavior remains untested. [PROJECT_STATUS.md](PROJECT_STATUS.md) records the evidence and limits.

P1.1 remains a planning candidate; authorization to implement is separate.
