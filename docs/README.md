# Narudžbine documentation

Repeat wholesale ordering between existing trading partners in Serbia (RSD) and Bosnia and Herzegovina (BAM): a Java backend (`BE/`), a web app and a mobile app (`FE/`). This is the entry point to every document in the repository. The wire contract itself is [openapi.yaml](../openapi.yaml).

## Start here

| If you are… | Read, in order |
|---|---|
| New to the project | [Status](project/status.md) → [Product overview](product/product-overview.md) → [Architecture](architecture/architecture.md) → [Decisions](project/decisions.md) (governance entries first) |
| Working on the backend | [Status](project/status.md) → [Design spec](architecture/design-spec.md) → [openapi.yaml](../openapi.yaml) → [Backend records](backend/README.md) for your feature → [AI operations](operations/ai-operations.md) |
| Working on the frontend | [Frontend overview](frontend/overview.md) → [Integration guide](frontend/integration-guide.md) → [Backend gaps](frontend/backend-gaps.md) → [E2E testing](frontend/e2e-testing.md) |
| Operating the system | [Runbook](operations/runbook.md) → [Local tooling](operations/local-tooling.md) → [Infrastructure](architecture/infrastructure.md) |
| An AI agent | [AGENTS.md](../AGENTS.md) (rules and precedence) — then the row for your area |

## Project — governance, scope and status

| Document | What it is |
|---|---|
| [Status](project/status.md) | Current state: what is built and verified, open external gates. Read first. |
| [Status history](project/status-history.md) | Superseded status snapshots and execution history. |
| [Decisions](project/decisions.md) | Register of every decision (`D-GOV-*`, `D-PRO-*`, `D-ORG-*`, `D-PLAN-*`, …): source, rationale, implications. |
| [Requirements](project/requirements.md) | Register of 543 requirements (`R-*`) derived from approved decisions. |
| [Questions](project/questions.md) | Interview questions and their answers (`Q-*`); historical, resolved by decisions. |
| [Traceability](project/traceability.md) | Requirement and API operation → planned implementation and verification. |
| [Implementation plan](project/implementation-plan.md) | Vertical slices VS-00…13 and their acceptance. |
| [Local completion plan](project/local-completion-plan.md) | The serial plan that finished local backend work. |
| [Planning review](project/planning-review.md) | P1.1 planning review and its independent findings. |
| [Source inventory](project/source-inventory.md) | What the original frontend source contained (historical evidence). |

## Architecture and specifications

| Document | What it is |
|---|---|
| [Architecture](architecture/architecture.md) | Modules, transactions, security and deployment shape of the modular monolith. |
| [Domain model](architecture/domain-model.md) | Entities, states and invariants. |
| [Design spec](architecture/design-spec.md) | Normative detailed rules (formerly `DESIGN_SPEC.md`, cited throughout the API contract). |
| [API contract](architecture/api-contract.md) | Contract conventions, operation index and approved API inputs. |
| [openapi.yaml](../openapi.yaml) | The machine-readable wire contract (225 operations). |
| [Infrastructure](architecture/infrastructure.md) | Hosting, providers, environments and data protection. |
| [Dependencies](architecture/dependencies.md) | Exact versions, BOMs, images and security exceptions. |

## Backend engineering records

[Backend index](backend/README.md) — one file per feature (108), grouped into 14 domains: identity, organizations, trading, catalogue, pricing, inventory, media, ordering, buyer workspace, notifications, reporting, privacy and audit, retention, platform. Each merges the feature's discovery, implementation decisions, review, verification evidence and operations notes. Also: [increment log](backend/increment-log.md), [final local review](backend/platform/final-local-review.md), [local acceptance checklist](backend/platform/local-acceptance-checklist.md).

## Frontend

| Document | What it is |
|---|---|
| [Overview](frontend/overview.md) | Workspace layout, commands, configuration, local development. |
| [Integration guide](frontend/integration-guide.md) | How the apps call the API: client, sessions, errors, ids, idempotency, revisions, i18n. |
| [Backend gaps](frontend/backend-gaps.md) | Everything the UI needs that the backend lacks, contract issues, unverifiable areas. |
| [Area notes](frontend/area-notes/) | Per-area integration detail: [identity & organization](frontend/area-notes/identity-organization.md), [vendor catalogue](frontend/area-notes/vendor-catalogue.md), [buyer ordering](frontend/area-notes/buyer-ordering.md), [orders](frontend/area-notes/orders.md), [trading, reporting & plans](frontend/area-notes/trading-reporting-plans.md), [platform admin](frontend/area-notes/platform-admin.md). |
| [Backend handoff](frontend/backend-handoff.md) | Per-increment API handoff notes written by the backend. |
| [E2E testing](frontend/e2e-testing.md) | Browser checks against the local backend and the limits they respect. |
| [Build log](frontend/build-log.md) | Append-only frontend decisions and discoveries. |

## Product — original intent

Product and UX intent written before the backend existed. Where these describe data shapes, endpoints or concepts the backend does not have, the [design spec](architecture/design-spec.md) and [openapi.yaml](../openapi.yaml) win (see the [build log](frontend/build-log.md)).

| Document | What it is |
|---|---|
| [Product overview](product/product-overview.md) | Users, goals, scope, open questions (v1.1). |
| [Screens and flows](product/screens-and-flows.md) | Navigation and screen inventory (v1.1). |
| [Visual design system](product/visual-design-system.md) | Tokens, typography, components, tone (v1.1). |
| [Landing page design brief](product/landing-page-design.md) | Positioning, structure, visual language, copy and imagery for the public landing page. |
| [Frontend agent instructions](product/frontend-agent-instructions.md) | Original frontend build instructions (v1.1). |
| [Data contract outline](product/data-contract-outline.md) | Pre-backend API sketch — superseded by openapi.yaml, kept for history. |
| [Archive: v1.0](archive/product-v1.0/) | The first version of the five product documents. |

## Operations

| Document | What it is |
|---|---|
| [Runbook](operations/runbook.md) | Costs, secret rotation, release, rollback, restore, monitoring. |
| [Local tooling](operations/local-tooling.md) | Synthetic developer API, local release rehearsal, recovery and load tooling. |
| [AI operations](operations/ai-operations.md) | How AI-led development and DevOps work here: cadence, review, verification. |

## Reference

- [Former names](former-names.md) — where every document lived before this layout (old names still appear in older text and the API contract).
- `python docs/check-links.py` — verifies every relative link in the repository's markdown.
- Instruction files that tools load from fixed places stay outside `docs/`: [AGENTS.md](../AGENTS.md), [FE/CLAUDE.md](../FE/CLAUDE.md), `FE/apps/*/AGENTS.md` and `CLAUDE.md`.
