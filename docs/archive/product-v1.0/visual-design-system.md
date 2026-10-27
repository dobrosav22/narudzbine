# Visual Design System

Companion to `02-frontend-agent-instructions.md`. Read this before writing
any UI. It defines the color, type, and shape tokens for the whole app —
web and mobile both derive from these, even though mobile can't consume
shadcn directly.

**Direction:** clean, minimal, neutral-first (black/white flipping by mode),
with **one strong accent color (purple)** used sparingly — for actions,
active states, links, and brand moments — never as a flood background.
Light mode is primary; dark mode is a fully supported secondary mode, not
an afterthought.

---

## 1. Color system

### Neutrals (backgrounds, text, borders, chrome)

Use shadcn's **Neutral** or **Zinc** base palette (pick one during
`shadcn init` — Zinc leans very slightly cooler/blacker, Neutral is a purer
gray; either is fine, Zinc is the more common "clean SaaS" choice). This
gives you the light/dark-flipping `background`, `foreground`, `muted`,
`border`, `card` variables for free — don't hand-roll these.

### Primary accent — purple

Base it on Tailwind's violet scale:

| Token | Light mode | Dark mode |
|---|---|---|
| `primary` | violet-600 (`#7c3aed`) | violet-400 (`#a78bfa`) |
| `primary-foreground` | white | near-black (matches dark neutral bg) |
| hover/active state | violet-700 (`#6d28d9`) | violet-300 (`#c4b5fd`) |
| subtle bg (badges, highlights) | violet-100 (`#ede9fe`) | violet-950 (`#2e1065`) at low opacity |

Dark mode uses a **lighter** violet than light mode (400 vs 600) — this is
standard practice, since a saturated 600-level purple loses contrast and
looks muddy on a dark background; a lighter tint keeps it legible.

**Note for whoever implements this:** treat the hex values above as
directional, not gospel — generate the actual CSS variables through
shadcn's own tooling (`shadcn init`'s color prompt, or a theme generator
like the one at ui.shadcn.com or tweakcn.com) so they come out as properly
calibrated OKLCH values consistent with the rest of the shadcn palette,
rather than hand-converting hex to OKLCH.

### Semantic colors — deliberately distinct from the purple accent

| Purpose | Color | Why separate |
|---|---|---|
| Success | emerald/green (e.g. `emerald-600`) | Standard convention; keeping it green (not purple) avoids "is this a brand moment or a success state?" ambiguity |
| Warning | amber (e.g. `amber-500`) | |
| Destructive/error | red (shadcn's default `destructive` is fine as-is) | |
| Info | keep neutral or a muted blue — avoid purple here too, to keep the accent meaningful | |

Order-status badges (a UI element that appears constantly — see
`03-frontend-screens-and-flows.md`) should use these semantic colors keyed
off each status's `isTerminal`/`isCancelled` flags, **not** the purple
accent — purple stays reserved for primary actions and navigation, so it
keeps its visual weight.

---

## 2. Typography

- **Font:** Geist Sans (Vercel's font, pairs naturally with shadcn/Next.js,
  free, variable font) as the default. Inter is an equally safe fallback if
  Geist isn't available in a given environment.
- **Monospace:** Geist Mono (or system mono) for SKUs, order IDs, and any
  tabular numeric data — makes catalogue/order tables easier to scan.
- Use shadcn's default type scale (`text-sm`/`text-base`/`text-lg`/etc.) —
  don't introduce a custom scale on top of Tailwind's.

## 3. Shape & elevation

- **Border radius:** medium-rounded, not sharp and not pill-shaped —
  shadcn's `"radius": 0.625rem` (their "new-york" style default) fits the
  clean-minimal brief well. Set this once in `components.json`/CSS
  variables, don't override per-component.
- **Shadows:** minimal. Rely on shadcn's default subtle card/dropdown
  shadows; avoid adding heavier drop shadows — flat + neutral is part of
  what makes this read as "clean" rather than "busy."
- **Density:** given this app has genuinely data-heavy screens (catalogue
  tables, order lists, stats), default to shadcn's standard density for
  marketing-style pages but use the more compact row heights /
  smaller-text variants (`text-sm`, tighter padding) inside tables and
  lists specifically — a clean look and a dense data table aren't in
  conflict as long as the compactness is contained to the data areas.

## 4. Applying purple with restraint

To keep this from drifting into "purple everywhere":

- **Do** use it for: primary buttons, active nav items, focus rings,
  selected states (e.g. active vendor in the vendor switcher), links,
  the app's own logo/wordmark if there is one.
- **Don't** use it for: success/error states, large background fills,
  every icon, or as a substitute for hierarchy (i.e. don't make something
  purple just to make it stand out — use size/weight/position for that,
  and save purple for actual interactive/brand moments).

## 5. Mobile (`apps/mobile`)

shadcn's CLI/skill don't reach React Native. **Mobile styling approach:
NativeWind** (resolved 2026-09) — it consumes a Tailwind config directly,
so `apps/mobile` shares the *same* token source (colors, radius, spacing)
as `apps/web` instead of a hand-translated duplicate. Concretely: define
the palette/radius/spacing scale once (ideally in a shared
`packages/core` or `packages/ui` Tailwind preset both apps extend), and
have `apps/mobile`'s `tailwind.config.js` extend that preset rather than
redeclaring the violet/neutral values. This supersedes the earlier
"keep mobile minimal until an approach is chosen" guidance in
`02-frontend-agent-instructions.md` — mobile screens can now be styled to
match the visual direction, not left plain.
