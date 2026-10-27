# Landing page design brief

A brief for a designer or a design agent: what the public landing page for Narudžbine should look like, say and show. It defines the positioning, the page structure, the visual language, the copy and the imagery. It does not define code, and it is not a requirement for the backend.

Everything the page says about the product must stay true to the [requirements](../project/requirements.md) and [decisions](../project/decisions.md). Section 10 lists the claims the page must not make. Text in `{CURLY_CAPS}` is a placeholder for a fact that has not been decided yet. Leave it as a visible placeholder in the design and never fill it with an invented value.

---

## 1. Positioning

### Who buys this

The paying customer is the **vendor**: a distributor or wholesaler in Serbia or Bosnia and Herzegovina. A typical vendor has 10 to 500 regular business customers (shops, cafés, hotels, offices, cleaning services, workshops). It sells consumables those customers re-order every week or every month, such as paper and hygiene supplies, cleaning products, packaging, beverages, food service supplies, office supplies or spare parts. The person who decides is the owner or the sales manager, and is usually 35 to 60 years old. They are not a software enthusiast. They judge a tool by asking whether it saves them phone calls and mistakes, and whether their customers will actually use it.

The **buyer** is the vendor's existing customer. The buyer never pays attention to a landing page first. They arrive because their vendor invited them. The page still needs a short section for buyers, because the vendor's biggest worry is whether the buyers will adopt the tool.

### How they order today (the enemy is the status quo, not a competitor)

In this region, repeat wholesale ordering mostly runs on:

- Viber and WhatsApp messages, often late in the evening, sometimes as a photo of a handwritten list
- phone calls to a sales rep, who writes the order down
- an Excel or PDF price list that is out of date as soon as it's sent
- prices agreed separately with each customer, which live in someone's head or a spreadsheet
- someone retyping every order into the warehouse or invoicing software

The resulting pain: missed or misread orders, wrong quantities or pack sizes, the wrong price for a customer, constant "did you get my order?" and "when is it coming?" messages, and sales staff spending their day taking dictation.

### The one-sentence promise

> Your regular customers order on their own, at their own prices, from web or phone. You get clean, complete orders instead of messages and calls.

### Proof pillars (in priority order)

1. **Their prices, always right.** Base price, volume tiers, a negotiated price per customer and automatic promotions are resolved the same way every time. This is the strongest differentiator, so show it with a worked example.
2. **Orders arrive complete.** Each order carries its products, units and packs, quantities, prices, delivery location and contact. Minimum and step quantities are enforced before the order is sent. Nothing needs to be retyped or clarified.
3. **Re-ordering takes seconds for buyers.** Repeat a past order, favorites, most-ordered products, drafts shared across the buyer's team, saved delivery locations.
4. **Everyone knows the status.** The vendor defines its own processing stages, each order has its own message thread, and notifications go out in the app, by push and by email.
5. **It's yours alone.** This is not a marketplace. Only customers you invite see your catalogue and prices. Nobody browses you, and no competitor sees your price list.
6. **Built for Serbia and BiH.** Serbian (Latin, Ekavian), Bosnian (Latin) and English. RSD and BAM. Local time zones. Web, Android and iOS.

### Tone of voice

Direct, concrete, calm and a little dry, like an experienced colleague in the trade, not a startup. Use short sentences and real nouns: towels, pallets, boxes, the evening Viber message. Address the reader formally ("vi"). Avoid hype words: *revolucionarno, moćno, pametno, AI, besprekorno, transformišite, otključajte*. Numbers beat adjectives.

---

## 2. Page goals and calls to action

- **Primary CTA:** request a demo or join the pilot. Vendors cannot sign up on their own: a platform administrator sets up each vendor and assigns its plan. The CTA therefore leads to a short contact form, not a sign-up flow.
  - SR: **Zakažite prezentaciju** · EN: **Book a demo**
  - Form fields: name, company, country (Serbia / Bosnia and Herzegovina), phone or email, approximate number of regular customers (select: up to 5 / up to 50 / up to 500 / more), an optional message. Nothing else.
  - Where the form is sent is `{LEAD_FORM_DESTINATION}`. The backend has no lead endpoint, so the design must not assume one exists.
- **Secondary CTA:** **Pogledajte kako radi** / **See how it works**. It scrolls to the "How it works" section.
- **Utility link:** **Prijava** / **Log in** in the header, leading to the existing app login.
- **For invited buyers:** one quiet line near the buyer section: "Dobili ste pozivnicu od dobavljača? Otvorite link iz e-pošte." / "Got an invitation from your supplier? Open the link in your email."

Success metric for the page: demo requests from qualified vendors. Do not optimize for newsletter sign-ups or social follows.

---

## 3. Page structure

The sections, in order. Visual rhythm is noted with each: **P** is a paper (light) section, **I** is an ink (dark) band.

| # | Section | Purpose | Rhythm |
|---|---|---|---|
| 0 | Header | Navigation, language, log in, CTA | P, sticky |
| 1 | Hero | Promise, CTA, the product itself | P |
| 2 | "Zvuči poznato?" (the status quo) | Recognition of the pain | P, warm tint |
| 3 | Before → after | The turning point: the message chaos becomes one order | P |
| 4 | How it works (3 steps) | Lower perceived effort | P |
| 5 | Prices per customer | The strongest differentiator, with a worked example | I |
| 6 | Vendor features | Catalogue, orders, stock, team, reports | P |
| 7 | For your buyers | Answer "will my customers use it?" | P, violet-subtle tint |
| 8 | Mobile and notifications | Web, Android, iOS, push and email | P |
| 9 | Built for Serbia and BiH | Local fit and trust | P |
| 10 | Pricing (plans) | Plans and their limits | P |
| 11 | FAQ | Remove objections | P |
| 12 | Final CTA | Convert | I |
| 13 | Footer | Legal, language, contact | I, continues 12 |

Navigation anchors: Funkcije (6), Kako radi (4), Za kupce (7), Paketi (10), Pitanja (11).

---

## 4. Visual language

### Concept: "the order slip, made exact"

The physical object behind this business is the paper order or delivery slip (*otpremnica*): a ruled sheet with columns for product, unit, quantity and price, a stamp and a signature. The visual identity borrows from it: warm paper backgrounds, fine ruled lines, tabular monospace figures, a stamp-like status badge. The product interface itself is the main image. The page should feel like a well-made business document rendered by software, not like a generic SaaS template.

### Colors

The page extends the product's own tokens ([visual design system](visual-design-system.md), [`FE/packages/ui/tokens.cjs`](../../FE/packages/ui/tokens.cjs)). Screenshots and the page must therefore look like one brand. The product UI is zinc and violet. The landing page adds a warm paper neutral around it.

| Role | Token name | Value (light) | Use |
|---|---|---|---|
| Paper | `lp-paper` | `#F7F5F0` | Default page background. Warm, never pure white. |
| Paper raised | `lp-paper-raised` | `#FFFFFF` | Cards and screenshot frames on paper. |
| Paper warm | `lp-paper-warm` | `#F1ECE2` | Section 2 (the status quo) only. |
| Ink | `lp-ink` | `#18181B` (zinc-900) | Headlines and body text. Dark bands use `#0F0F12`. |
| Ink muted | `lp-ink-muted` | `#5B5B66` | Secondary text. Must reach 4.5:1 contrast on paper. |
| Rule | `lp-rule` | `#E4DFD5` | Ruled lines, borders, table rules. |
| Violet | `primary` | violet-600 `#7C3AED` (dark bands: violet-400 `#A78BFA`) | Primary CTA, links, one highlighted word or figure per section at most. |
| Violet subtle | `primary-subtle` | violet-100 `#EDE9FE` | The background of section 7 and "your price" chips. |
| Stamp green | `success` | emerald-600 `#059669` | The "Isporučeno" / "Delivered" stamp and success states only. |
| Amber | `warning` | amber-500 `#F59E0B` | Small marks in section 2 only, such as missed-call dots or the "nepročitano" badge. |

Rules:

- Violet covers at most about 5% of any viewport. It is for actions and a few emphasis moments. It is never a section fill, a gradient or a glow.
- **No gradients** anywhere: no gradient text, no mesh or aurora backgrounds, no glows behind screenshots.
- The two ink bands (sections 5 and 12 with the footer) are the only full-width dark areas. They break the page rhythm and frame the most important content.
- Dark mode: support `prefers-color-scheme` by mapping paper to zinc-950 `#09090B`, paper raised to zinc-900 and rule to `rgba(255,255,255,.10)`, using the product's dark tokens. The ink bands stay dark in both modes and get a 1px top rule in dark mode so they don't merge with the page.

### Typography

- **Headlines:** a grotesk with some character and tight spacing. The default is **Geist** (already the product font) in 600 weight with −0.025em tracking. A designer may propose one distinctive display face instead, such as Schibsted Grotesk, Instrument Sans or Bricolage Grotesque. Whatever is used must be checked to render **č ć đ š ž Č Ć Đ Š Ž** correctly in every weight used. Đ is the letter most often missing or badly drawn. Reject any font that fails.
- **Body:** Geist 400, 18px with 1.6 line height on desktop and 16px with 1.55 on mobile. Measure is 60 to 72 characters.
- **Figures:** Geist Mono with tabular numerals for prices, quantities, SKUs and order numbers, everywhere they appear, including outside screenshots. This is a signature of the page: money and quantities always look exact.
- **Scale** (fluid): display `clamp(2.5rem, 1.6rem + 3.6vw, 4.5rem)`, leading 1.05. H2 `clamp(1.875rem, 1.4rem + 1.8vw, 2.75rem)`, leading 1.1. H3 1.25rem/1.3. Eyebrow 0.8125rem, uppercase, +0.08em tracking, ink-muted, preceded by a section number in mono (`01 — ZVUČI POZNATO?`).
- Serbian text runs about 15 to 25% longer than English. Design every headline and button with the Serbian text first. Never truncate. Let lines wrap.

### Shapes, lines and depth

- Radius 10px (the product's 0.625rem) for cards and frames, 999px for chips only. Buttons use 10px, not pills.
- **Ruled lines are the main graphic device:** 1px `lp-rule` horizontal lines between rows of feature lists, table-like layouts and a faint ruled-paper texture (lines every 32px at 40% opacity) behind the section 3 "after" slip. Use no other background patterns.
- Shadows only on product screenshots, one soft layer: `0 1px 2px rgba(24,24,27,.06), 0 12px 32px -12px rgba(24,24,27,.18)`. Nothing else gets a shadow.
- The **stamp** motif: a rotated (−6°) outlined badge in emerald with mono uppercase text ("ISPORUČENO", "PRIMLJENO"). It appears at most twice on the page, on the section 3 slip and in one feature screenshot.

### Layout and grid

- 12-column grid, 1200px maximum content width, 24px column gutter.
- Side gutters are 16px on phones (up to 639px), 24px on tablets (640 to 1023px) and 32px on desktop (1024px and up). The page must never scroll horizontally.
- Section vertical spacing is 128px on desktop, 96px on tablets and 64px on phones.
- Layouts are **deliberately asymmetric**. Use left-aligned text with a large visual, offset screenshot stacks, and 5/7 or 4/8 column splits. Centered layouts are allowed only for the final CTA. Feature sections alternate the side the visual sits on.
- Touch targets are at least 44×44px. Primary buttons are 48px tall.

### Iconography

- Line icons with a 1.5px stroke, 20 to 24px, in ink color: Lucide, matching the product. Icons support labels and never replace them.
- No icon tiles (an icon in a colored rounded square over a title) and no emoji.

### Motion

- Keep it restrained and purposeful, under 400ms with ease-out. Content fades and rises 8px when it enters view, once.
- **The one signature animation** is in section 3: five or six chat bubbles collapse into the structured order slip, and the slip's total ticks into place in mono figures. It plays once when scrolled into view, can be replayed, and shows the final state at once under `prefers-reduced-motion`.
- No parallax, no scroll hijacking, no autoplay video with sound, no cursor effects, no typewriter headlines.

---

## 5. Imagery

### Product UI is the hero

Use **real screenshots of the actual app**, cropped and framed, rather than illustrations of a fictional dashboard. Before capturing, render them with synthetic, realistic data in Serbian (or Bosnian for BA-targeted variants):

- Vendor: "Higijena Plus d.o.o." (fictional). Products: *Papirni ubrusi 2-slojni, 12/1*, *Toalet papir 3-slojni, 10/1*, *Tečni sapun 5 L*, *Sredstvo za pod 5 L*, *Kese za smeće 120 L, 10/1*, *Rukavice nitrilne M, 100/1*. Units: kom, pak, kut, l.
- Buyers: "Kafe Ugao", "Hotel Drina", "Market Centar", "Servis Čisto". Make sure every name is fictional and not a real registered business.
- Prices in RSD with two decimals and thousands separators in local format (`1.250,00 RSD`), and the equivalent in BAM for BA variants (`24,90 KM`). The *KM* vs *BAM* display label is `{BAM_DISPLAY_LABEL}`, to be confirmed against the app's formatting.
- No real customer data, no real people's names or emails, no real company logos.

Frame screenshots in a simple device or window frame: a thin neutral border, 10px radius and the single shadow. Do not use glossy realistic device mockups. On a phone, use a plain rounded frame without a notch rendering.

### Hero visual composition

A layered pair, offset:

- **Back, larger (desktop web):** the vendor's order list. Several new orders with buyer names, a status column showing the vendor's custom stages (for example *Primljeno → U pripremi → Isporučeno*) and totals in mono.
- **Front, overlapping bottom-left (phone):** the buyer's catalogue on mobile, with one product card showing a violet **"Vaša cena"** / **"Your price"** chip, quantity steppers and a sticky "Pošalji narudžbinu" bar.
- One stamp on the desktop screenshot's corner.

On phones, show only the phone screenshot, full width, under the CTA.

### Section 2 imagery (the status quo)

Illustrate the mess **without real brands**. Use generic chat bubbles: grey incoming, timestamps like `22:47`, a photo-of-a-list placeholder (a hand-drawn list on squared paper, rendered as a simple flat illustration or a real photo taken for the project), a missed-call row, and a spreadsheet fragment named `cenovnik_FINAL_v3.xlsx`. Do not show Viber or WhatsApp logos, colors or interface chrome. Name them in the text only.

### Photography

**No stock photography.** No handshakes, no headset-wearing support agents, no people pointing at laptops. If photography is ever used, it must be commissioned and real: a regional warehouse aisle or a loading dock in natural light. It is optional and should be treated as a later enhancement. The page must work fully without photos.

### Open Graph and social images

1200×630, a paper background, the wordmark, the headline in two lines and the phone screenshot cropped on the right. One per language.

---

## 6. Section-by-section content

Serbian (Latin, Ekavian) is the primary language and is shown first. English follows in italics for the designer's understanding, and the English page uses its own natural copy (§7). Lengths are targets: keep headlines at or under the given word count.

### 0. Header

- Left: wordmark **Narudžbine** (working name; final brand `{BRAND_NAME}`). Set in the headline font at 600 weight, with a small violet square or a ruled "slip" glyph as the logomark. It is not a cart icon or a truck.
- Center (desktop): Funkcije · Kako radi · Za kupce · Paketi · Pitanja
- Right: language switcher as text (**SR · BS · EN**, with no flags, per the visual design system §6), **Prijava** (text link), **Zakažite prezentaciju** (primary button).
- Mobile: the wordmark, the CTA as a compact button and a menu icon that opens a full-height sheet with the same items.
- Sticky. On scroll, it gains a paper background and a bottom rule.

### 1. Hero

- Eyebrow: `ZA DISTRIBUTERE I VELEPRODAJU · SRBIJA I BIH`
- H1 (≤ 10 words): **Vaši stalni kupci naručuju sami. Bez poziva i poruka.**
  *Your regular customers order on their own. No calls, no messages.*
- Sub (≤ 30 words): Katalog, vaše cene za svakog kupca i sve narudžbine na jednom mestu — na vebu, Androidu i iPhone-u. Vi dobijate kompletne narudžbine, umesto poruka u 11 uveče.
  *Catalogue, your price for every customer and every order in one place, on web, Android and iPhone. You get complete orders, not messages at 11 pm.*
- Buttons: **Zakažite prezentaciju** (primary) · **Pogledajte kako radi** (secondary, outlined)
- Under the buttons, a mono microline: `Web · Android · iOS   |   RSD · KM   |   Srpski · Bosanski · English`
- Visual: as §5.

### 2. Zvuči poznato?

- Eyebrow: `01 — ZVUČI POZNATO?`
- H2: **Narudžbine stižu odasvud. Greške takođe.**
  *Orders come from everywhere. So do mistakes.*
- Five pain rows as a ruled list (no cards), each with a small mono timestamp or tag on the left:
  1. `22:47` — "Pošalji mi kao prošli put, samo duplo ubrusa." Ko se seća šta je bilo prošli put?
     *"Same as last time, double the towels." Who remembers what last time was?*
  2. `Propušten poziv` — Kupac je zvao tri puta. Komercijalista je bio na putu.
     *The customer called three times. The sales rep was on the road.*
  3. `cenovnik_FINAL_v3.xlsx` — Cenovnik je zastareo onog trenutka kada ste ga poslali.
     *The price list was out of date the moment you sent it.*
  4. `Dogovorena cena?` — Koja cena važi za ovog kupca? Zna samo onaj ko je dogovarao.
     *Which price applies to this customer? Only the person who agreed it knows.*
  5. `Prekucavanje` — Svaku narudžbinu neko ponovo kuca u sistem. Pakovanje 10/1 postane 10 komada.
     *Someone retypes every order. A 10-pack becomes 10 pieces.*
- Visual: the chat-bubble collage from §5 on the right, on paper-warm.

### 3. Before → after

- Eyebrow: `02 — JEDNA NARUDŽBINA`
- H2: **Jedna narudžbina. Kompletna. Odmah.**
  *One order. Complete. Immediately.*
- Body: Kupac bira proizvode iz vašeg kataloga, vidi svoju cenu i šalje narudžbinu. Vi dobijate tačne proizvode, pakovanja, količine, cene i adresu isporuke — bez ijednog pitanja nazad.
  *The customer picks from your catalogue, sees their price and sends the order. You get the exact products, packs, quantities, prices and delivery address, without asking a single question back.*
- Visual: the signature animation. The bubbles collapse into an order slip: a ruled table with mono columns *Proizvod · Pak. · Kol. · Cena · Iznos*, the buyer, the delivery location, the total and the "PRIMLJENO" stamp.

### 4. Kako radi

- Eyebrow: `03 — KAKO RADI`
- H2: **Spremni za dan, ne za mesec.**
  *Ready in a day, not a month.* (Keep this headline only if pilot onboarding confirms it. Otherwise use **Tri koraka do prve narudžbine.** / *Three steps to the first order.*)
- Three numbered steps in a horizontal row on desktop and stacked on mobile, connected by a ruled line (not arrows):
  1. **Unesite katalog.** Uvezite do 1.000 proizvoda iz CSV fajla odjednom, uz proveru pre potvrde, ili ih dodajte ručno. Cene, pakovanja, minimalne količine.
     *Bring your catalogue. Import up to 1,000 products from one CSV file, checked before you confirm, or add them by hand. Prices, packs, minimum quantities.*
  2. **Pozovite kupce.** Kupci dobijaju pozivnicu e-poštom i odmah vide vaš katalog sa svojim cenama.
     *Invite your customers. They get an email invitation and immediately see your catalogue at their prices.*
  3. **Primajte narudžbine.** Potvrdite, pratite faze i dopisujte se uz svaku narudžbinu.
     *Receive orders. Confirm them, move them through your stages and message about each one.*

### 5. Cene po kupcu (ink band)

- Eyebrow: `04 — CENE`
- H2: **Svaki kupac vidi svoju cenu. Uvek tačno izračunatu.**
  *Every customer sees their price. Always calculated correctly.*
- Body: Osnovna cena, popust na količinu, dogovorena cena za pojedinačnog kupca i akcije koje se primenjuju same. Pravila su ista za svaku narudžbinu, bez ručnog računanja.
  *Base price, volume tiers, a negotiated price per customer and promotions that apply themselves. The same rules on every order, with no manual calculation.*
- **Worked example** as a "receipt" card (paper-raised on ink, mono figures, ruled rows). This is the most important visual on the page after the hero. The numbers are illustrative but must stay mathematically correct:

  | | |
  |---|---|
  | Osnovna cena | 100,00 |
  | Od 10 kom | 90,00 |
  | Dogovorena cena za *Hotel Drina* | **80,00** ← važi |
  | Akcija −10% | **72,00** |
  | 12 kom × 72,00 | **864,00 RSD** |

  Caption: Dogovorena cena ima prednost, a najbolja važeća akcija se primenjuje na nju. Cene su bez PDV-a.
  *The agreed price takes precedence, and the best eligible promotion applies on top of it. Prices exclude VAT.*
- Three short supporting points beside the receipt:
  - **Popust na količinu.** Cena po pragu važi za celu količinu. *Volume price applies to the whole quantity.*
  - **Akcije po kupcu, kategoriji ili celom katalogu**, sa početkom i krajem. Bez kupona. *Promotions by customer, category or whole catalogue, with start and end dates. No coupon codes.*
  - **Poslata narudžbina se ne menja.** Kasnija promena cene ne dira već poslate narudžbine. *A sent order never changes. Later price edits don't touch orders already sent.*

### 6. Funkcije za dobavljače

- Eyebrow: `05 — ZA DOBAVLJAČE`
- H2: **Sve što vam treba za narudžbine. Ništa što vam ne treba.**
  *Everything you need for orders. Nothing you don't.*
- Four feature rows, alternating sides, each with a real screenshot crop:
  1. **Katalog koji se lako održava.** Kategorije, oznake, do pet slika po proizvodu, pakovanja i jedinice, minimalna količina i korak. Grupne izmene cena i oznaka odjednom. Istaknuti proizvodi na vrhu kataloga.
     *A catalogue that's easy to maintain. Categories, tags, up to five images per product, packs and units, minimum and step quantities. Bulk-edit prices and tags. Featured products on top.*
     Screenshot: the vendor catalogue table, with mono SKUs.
  2. **Narudžbine u vašim fazama.** Definišite svoje faze obrade — od prijema do isporuke. Poruke uz svaku narudžbinu, tako da ništa ne ostane u privatnom telefonu.
     *Orders in your own stages. Define your processing stages, from receipt to delivery. A message thread on each order, so nothing stays on someone's private phone.*
     Screenshot: order detail with the stage progression and a short message thread. The stamp goes here.
  3. **Zalihe, ako želite.** Uključite praćenje zaliha i narudžbina se ne može poslati za više nego što imate. Ne treba vam? Isključite.
     *Stock, if you want it. Turn stock tracking on and orders can't exceed what you have. Don't need it? Leave it off.*
  4. **Tim i izveštaji.** Vlasnik, administratori i osoblje sa jasnim ovlašćenjima. Izveštaji po proizvodu, kupcu i periodu, uz izvoz u CSV.
     *Team and reports. Owner, admins and staff with clear permissions. Reports by product, customer and period, with CSV export.*
- Under the rows, a compact two-column ruled "also included" list with no icons: Više lokacija za otpremu · Obaveštenja e-poštom i push · Prijava preko Google i Apple naloga · Istorija svake promene na narudžbini · Kupci iz Srbije u RSD, iz BiH u KM.
  *Multiple fulfillment locations · Email and push notifications · Sign in with Google and Apple · Full order history · Serbian customers in RSD, BiH customers in KM.* (Verify each item against the final app before publishing.)

### 7. Za vaše kupce (violet-subtle band)

- Eyebrow: `06 — ZA KUPCE`
- H2: **Kupci će ga zaista koristiti. Jer im štedi vreme.**
  *Your customers will actually use it, because it saves them time.*
- Body: Najveće pitanje je uvek isto: „Hoće li moji kupci ovo hteti?" Napravili smo ga tako da ponovna narudžbina traje kraće od poruke.
  *The big question is always the same: "Will my customers want this?" We built it so re-ordering takes less time than writing a message.*
- Five benefit lines in a ruled list, each leading with a bolded verb:
  - **Ponovite** prethodnu narudžbinu jednim dodirom. Promenjene cene i nedostupni artikli su jasno označeni. *Repeat a previous order in one tap, with changed prices and unavailable items clearly flagged.*
  - **Sačuvajte** omiljene i najčešće naručivane proizvode. *Keep favorites and most-ordered products at hand.*
  - **Pripremite** narudžbinu zajedno — nacrti su zajednički za ceo tim i ne ističu. *Prepare an order together. Drafts are shared with the whole team and never expire.*
  - **Odlučite** ko šalje: osoblje može slati samo ili predati nacrt šefu na proveru. *Decide who sends. Staff can submit directly or hand the draft to a manager for review.*
  - **Birajte** adresu isporuke među sačuvanim lokacijama i pratite status bez zvanja. *Pick a saved delivery location and follow the status without calling.*
- Visual: phone screenshots of the reorder screen and the drafts list, side by side.
- Quiet line: Dobili ste pozivnicu od dobavljača? Otvorite link iz e-pošte. *Got an invitation from your supplier? Open the link in your email.*
- Do not state a price for buyers. Whether buyer access is free is `{BUYER_ACCESS_TERMS}`.

### 8. Na telefonu i na računaru

- Eyebrow: `07 — WEB I MOBILNI`
- H2: **U kancelariji, u magacinu, na terenu.**
  *In the office, the warehouse, on the road.*
- Body: Web aplikacija i aplikacije za Android i iPhone. Obaveštenja stižu u aplikaciji, kao push i e-poštom — svako bira šta želi da prima.
  *A web app plus Android and iPhone apps. Notifications arrive in the app, as push and by email, and everyone chooses what they receive.*
- Visual: one phone showing a notification list ("Nova narudžbina — Kafe Ugao", "Nova poruka uz narudžbinu #…"), next to a laptop crop of the same order.
- Store badges are shown only when the apps are actually published: `{APP_STORE_LINKS}`. Until then, use the plain text "Android i iOS — uskoro u prodavnicama" or omit the badges.

### 9. Napravljeno za Srbiju i BiH

- Eyebrow: `08 — SRBIJA I BIH`
- H2: **Domaći jezik, domaća valuta, domaće navike.**
  *Local language, local currency, local habits.*
- Three columns, typographic only, with big mono figures as anchors:
  - `RSD · KM` — Dobavljači iz Srbije posluju u dinarima, iz BiH u konvertibilnim markama. Bez preračunavanja. *Serbian vendors trade in dinars, BiH vendors in convertible marks. No conversion.*
  - `SR · BS · EN` — Srpski (latinica, ekavica), bosanski i engleski. Svaki korisnik bira svoj jezik. *Serbian (Latin, Ekavian), Bosnian and English. Every user picks their own language.*
  - `0` — Nula stranih kupaca u vašem katalogu. Vide ga samo kupci koje vi pozovete. *Zero strangers in your catalogue. Only customers you invite can see it.*
- Data location claims (such as EU hosting) appear only after hosting is provisioned and verified: `{DATA_LOCATION_CLAIM}`.

### 10. Paketi

- Eyebrow: `09 — PAKETI`
- H2: **Paket prema broju proizvoda i kupaca.**
  *A plan for your number of products and customers.*
- Sub: Plaćanje narudžbina ostaje kako ste dogovorili sa kupcima — aplikacija ne naplaćuje ništa u vaše ime.
  *Payment for orders stays as you've agreed with your customers. The app collects nothing on your behalf.*
- Three plan cards on desktop (one row) and stacked on mobile in order Growth, Starter, Pro. Growth is the recommended plan and is marked with a thin violet top border and the label **Najčešći izbor** (*Most popular*) only if pilot data supports it. Otherwise use **Preporučeno** (*Recommended*).

  | | Starter | Growth | Pro |
  |---|---|---|---|
  | Proizvodi (bez arhiviranih) | do 10 | do 250 | do 5.000 |
  | Aktivni kupci | do 5 | do 50 | do 500 |
  | Cena (Srbija) | `{PRICE_STARTER_RSD}` | `{PRICE_GROWTH_RSD}` | `{PRICE_PRO_RSD}` |
  | Cena (BiH) | `{PRICE_STARTER_BAM}` | `{PRICE_GROWTH_BAM}` | `{PRICE_PRO_BAM}` |
  | Za koga | Probni rad, mali asortiman | Tipičan regionalni distributer | Veliki asortiman i mreža kupaca |

- Every plan includes all features. The only differences are the limits. State this explicitly: **Sve funkcije u svakom paketu. Razlikuju se samo ograničenja.** (*Every feature in every plan. Only the limits differ.*)
- Card CTA: **Zatražite ponudu** (*Request a quote*). It opens the same lead form with the plan preselected.
- Small print: Promena paketa ide preko naše podrške i važi odmah. Paket se ne može smanjiti dok broj proizvoda ili kupaca prelazi novo ograničenje. *Plan changes go through our support and take effect immediately. A plan can't be downgraded while products or customers exceed the new limit.*
- Until monetary prices are approved, the price row shows **Cena na upit** (*Price on request*) and nothing else. Never show crossed-out "launch" prices or "free" labels.
- Counting rules shown as an info tooltip: inactive products count toward the limit and archived ones don't. Only active customer connections count, and pending invitations don't.

### 11. Česta pitanja

An accordion with single-open, plain text, and a ruled line between items:

1. **Da li je ovo prodavnica ili marketplace?** Ne. Vaš katalog vide samo kupci koje pozovete. Nema pretrage dobavljača ni oglasa. *Is this a shop or marketplace? No. Only customers you invite see your catalogue. No supplier search, no ads.*
2. **Da li se plaćanje vrši kroz aplikaciju?** Ne. Plaćanje ostaje van aplikacije, kao i do sada. *Do payments go through the app? No. Payment stays outside the app, as it is today.*
3. **Da li se povezuje sa mojim knjigovodstvenim programom?** Ne za sada. Narudžbine i izveštaje možete izvesti u CSV. *Does it connect to my accounting software? Not yet. You can export orders and reports to CSV.* (Narudžbine, izveštaji po proizvodima i, za dobavljače, po kupcima.)
4. **Šta ako kupac nema vremena da uči novu aplikaciju?** Ponovna narudžbina je jedan dodir, a pozivnica stiže e-poštom sa direktnim linkom. *What if a customer has no time to learn a new app? Re-ordering is one tap, and the invitation arrives by email with a direct link.*
5. **Mogu li da prodajem kupcima iz druge države?** Ne. Dobavljači iz Srbije posluju sa kupcima iz Srbije, a dobavljači iz BiH sa kupcima iz BiH. *Can I sell to customers in the other country? No. Serbian vendors trade with Serbian buyers, BiH vendors with BiH buyers.*
6. **Da li su cene sa PDV-om?** Cene u aplikaciji su neto, bez PDV-a, a aplikacija ne izdaje račune. *Are prices with VAT? Prices in the app are net, excluding VAT, and the app does not issue invoices.* (Subject to the tax review in X-03; verify before publishing.)
7. **Koliko traje uvođenje?** `{ONBOARDING_TIME}`. *How long does onboarding take?*
8. **Gde se čuvaju podaci?** `{DATA_LOCATION_CLAIM}`. *Where is data stored?*

### 12. Final CTA (ink band)

- Centered, the only centered section.
- H2: **Neka sledeća narudžbina stigne sama.**
  *Let the next order arrive on its own.*
- Sub: Primamo prve distributere u pilot program. Prezentacija traje 30 minuta. *We're taking the first distributors into the pilot. The demo takes 30 minutes.* (Use the pilot line only while a pilot is actually running, and the duration only if confirmed: `{DEMO_DURATION}`.)
- Primary button (violet-400 on ink): **Zakažite prezentaciju**. Next to it, a contact line: `{CONTACT_EMAIL}` · `{CONTACT_PHONE}`.

### 13. Footer

Ink, compact, three columns: the wordmark with one line ("Naručivanje za veleprodaju između stalnih partnera."), page links, and legal links (Uslovi korišćenja `{TERMS_URL}`, Politika privatnosti `{PRIVACY_URL}`, Kolačići). Add the language switcher again and the company legal name `{LEGAL_ENTITY}`. No social media icons unless real accounts exist.

---

## 7. Languages

- Three equal pages, `/sr`, `/bs` and `/en`, each with fully written copy, not machine-translated. The default for unknown visitors is `/sr`. Each page links the others with `hreflang`.
- **Bosnian is not Serbian with a different flag.** Use Ijekavian forms and Bosnian vocabulary: *cijena* (not *cena*), *narudžba* (not *narudžbina*), *mjesec*, *uvijek*, *vrijeme*, *sedmica*, *dobavljač*, *KM* in running text. The headline becomes, for example, "Vaši stalni kupci naručuju sami. Bez poziva i poruka." (the same in this case), and the pricing headline becomes "Paket prema broju proizvoda i kupaca." Check every string with a native speaker from BiH.
- The product name *Narudžbine* is Serbian. In BiH it reads as Serbian-flavored, which is a brand question for `{BRAND_NAME}`. The design should work with a different wordmark of similar length (8 to 12 characters).
- English copy is for international partners and mixed teams. It should be idiomatic, not a literal translation of the Serbian.
- Number and date formats follow the page language: `1.250,00` and `27. 10. 2026.` for sr and bs, `1,250.00` and `27 Oct 2026` for en.

---

## 8. Responsive behavior

| Element | Phone (≤ 639) | Tablet (640–1023) | Desktop (≥ 1024) |
|---|---|---|---|
| Header | Wordmark, CTA, menu | Wordmark, menu, CTA, language | Full navigation |
| Hero | Text, then CTA, then phone screenshot full width | Text above, both screenshots offset below | Text 5 columns, visual 7 columns |
| Status quo | List, then collage below (reduced to three bubbles) | Same, collage beside on landscape | List 6 / collage 6 |
| Before → after | Slip only (static or animated), bubbles above | Animated | Animated, slip 7 columns |
| Steps | Vertical, rule on the left | Vertical | Horizontal, three columns |
| Price receipt | Full width, points below | Receipt 7 / points 5 | Receipt 6 / points 6 |
| Feature rows | Text, then screenshot | Alternating 6/6 | Alternating 5/7 |
| Plans | Stacked (Growth first), swipe not required | Two plus one | Three in a row |
| FAQ | Full width | 8 columns | 8 columns, offset 2 |

Screenshots must remain legible on phones. Crop them to the relevant area instead of shrinking a full desktop screen. Provide 1x and 2x assets in AVIF and WebP, with a PNG fallback only for the Open Graph image.

---

## 9. Quality bar: what makes it look made, not generated

Do:

- Use one strong idea (the order slip) and carry it through: ruled lines, mono figures, a stamp, a receipt.
- Show the real product with realistic local data on nearly every screen.
- Use asymmetry, varied section shapes and the two ink bands for rhythm.
- Write concrete, local copy with numbers, product names and times of day.
- Use typography as the main visual. Big confident headlines carry the page.
- Leave plenty of white space, then put density inside the screenshots and the receipt.

Don't:

- Purple or blue gradients, glowing blobs, aurora or mesh backgrounds, glassmorphism or frosted cards.
- Gradient text, or a "✨" or "AI-powered" badge.
- Three-column grids of identical cards with an icon in a colored square, repeated section after section.
- A centered hero with a pill-shaped "New" badge above the headline.
- Fake dashboards with random charts, fake logo walls ("trusted by…"), fake testimonials, fake star ratings, fake counters ("10.000+ narudžbina").
- Emoji in headings or lists, stock 3D illustrations or isometric characters.
- Copy like "Supercharge", "Unlock", "Seamless", "All-in-one platform", "Take your business to the next level", or their Serbian equivalents.
- Excessive motion, or sections that slide in from the sides.
- Dark mode as the default, or neon accents.

Social proof: until real pilot customers agree to be named, show **none**. Leave a defined slot after section 7 for one real testimonial (a quote, the person's role and company and a photo, with written permission) and one real number from pilot usage. Design the slot, hide it at launch.

---

## 10. Claims the page must not make

These would be false or are not yet decided. Check every draft against this list.

- **No self-service sign-up or free trial.** Vendors are set up by the platform team.
- **No online payments, invoicing, VAT calculation or fiscalization.** The app handles none of these.
- **No integrations with ERP, accounting or shipping software.** CSV import and export only.
- **No marketplace, supplier discovery or advertising.**
- **No cross-border ordering** between Serbia and BiH.
- **No two-factor or multi-factor authentication.** The product has no application MFA at launch. Do not imply "bank-level security".
- **No legal compliance claims** (GDPR, the Serbian data protection law ZZPL, BiH law) until legal review (X-04) is complete.
- **No uptime, support-hours or response-time promises** without an agreed operating model.
- **No offline mode claims.**
- **No coupons, loyalty points or promotion usage limits.**
- **No file attachments in order messages.**
- **No invented prices, customer counts, testimonials, logos, ratings or awards.**
- **No app store badges** before the apps are published.

---

## 11. Technical notes for whoever builds it

These are notes for the designer's awareness, not a specification of the implementation.

- The page is static, server-rendered content in the existing Next.js web app. It needs no session or data fetching. The root path `/` currently forwards email links (`/#/…`) into the app. The landing page must keep that forwarding working if it takes over `/`.
- Performance targets: LCP under 2.5s on mid-range Android over 4G, CLS under 0.05, total JavaScript for the page under 100 KB. The signature animation uses CSS and a small script. No heavy animation libraries, no video in the hero.
- Accessibility: WCAG 2.2 AA contrast, visible focus rings (violet), real text (never text baked into images, except the Open Graph image), alt text describing what each screenshot shows, `lang` set per page, reduced-motion support, a keyboard-operable FAQ and menu.
- SEO: unique title and description per language, for example *"Narudžbine — naručivanje za veleprodaju i distributere | Srbija"*. Target terms: *B2B naručivanje, aplikacija za narudžbine, naručivanje za veleprodaju, porudžbine kupaca, cenovnik za kupce*, and for BS *aplikacija za narudžbe, veleprodaja BiH*. Add `Organization` and `SoftwareApplication` structured data with no fake ratings, a sitemap, robots rules that index only the landing pages, and `noindex` on all app routes.
- Analytics and cookies: prefer cookieless, privacy-friendly analytics, so that no consent banner is needed. Any tool that sets cookies or tracks individuals needs the legal review (X-04) first. Track CTA clicks, form starts and submissions, and scroll depth by section.
- Deliverables expected from the designer: mobile (390px) and desktop (1440px) designs for every section, a tablet design (834px) for the hero, the pricing and the feature rows, light and dark variants of the hero, the pricing and one feature section, the screenshot frames, the signature animation storyboard (four keyframes), the Open Graph images and a list of the new tokens.

---

## 12. Open inputs

The design proceeds with visible placeholders for these. None may be invented.

| Placeholder | Needed from |
|---|---|
| `{BRAND_NAME}` | Business owner. Is *Narudžbine* final for both countries? |
| `{PRICE_*}` | Business owner. Plan prices per country; none are approved yet (D-SUB-007 approves limits only). |
| `{BUYER_ACCESS_TERMS}` | Business owner. Do buyers ever pay? |
| `{LEAD_FORM_DESTINATION}` | Business owner and engineering. Where demo requests go. |
| `{CONTACT_EMAIL}`, `{CONTACT_PHONE}`, `{LEGAL_ENTITY}` | Business owner. |
| `{TERMS_URL}`, `{PRIVACY_URL}` | Legal review (X-04). |
| `{DATA_LOCATION_CLAIM}` | Engineering, after hosting is provisioned and verified. |
| `{APP_STORE_LINKS}` | After the store releases are approved and published. |
| `{ONBOARDING_TIME}`, `{DEMO_DURATION}` | Pilot experience. |
| `{BAM_DISPLAY_LABEL}` | Confirm *KM* vs *BAM* against the app's currency formatting. |
| Testimonial and usage number | Real pilot customers, with written permission. |
