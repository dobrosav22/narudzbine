/**
 * Seed dataset (02 → "Mock data"). Coverage checklist:
 *  - Inventory tracking ON (Papirko) and OFF (CleanPro)                       ✔
 *  - Buyer org connected to 2+ vendors (Hotel Aurora → Papirko + CleanPro)   ✔
 *  - Buyer org with 2+ locations and 2+ users (Hotel Aurora: 3 + 3)          ✔
 *  - Quantity price tiers (Z-fold towels, trash bags, napkins, floor cleaner)✔
 *  - Per-buyer override (Aurora: foam soap + toilet paper; Lipa: napkins)    ✔
 *  - Active promotions (category, buyer-scoped, fixed) + one expired         ✔
 *  - Orders in many statuses; CleanPro uses a customised status list        ✔
 *  - Draft carts, favorites, and ~6 months of history for "most ordered"    ✔
 *  Extras: CleanPro sits exactly at its Starter plan's product limit (10/10)
 *  so the plan-limit prompt is reachable; low-stock + out-of-stock +
 *  inactive products; pending invites for a new buyer, an existing buyer
 *  and a team member.
 *
 * Dates are relative to `now` so the data always looks recent.
 * Every seeded login uses the password in MOCK_PASSWORD.
 *
 * All money is BAM (04 → "Currency"): realistic KM wholesale prices, converted
 * from the original EUR-based figures at the fixed peg 1 EUR = 1.95583 BAM and
 * rounded to 0.10 KM (BUILD_LOG 2026-09-27 "Seed prices in BAM").
 */
import type {
  BuyerProductPrice,
  Order,
  OrderMessage,
  OrderStatus,
  PriceTier,
  Product,
  Promotion,
} from '../types';
import { DEFAULT_ORDER_STATUSES } from '../constants';
import { resolvePrice } from '../pricing';
import { PRODUCT_IMAGES } from './productImages';
import type { MockDb } from './db';
import { mulberry32 } from './util';

export const MOCK_PASSWORD = 'demo';

/** Shown on the login screens so anyone can try each role. `webOnly`: the admin panel isn't on mobile (02 v1.1). */
export const DEMO_ACCOUNTS: readonly { email: string; label: string; webOnly?: boolean }[] = [
  { email: 'marko@papirko.rs', label: 'Vendor — Papirko Wholesale (tracks inventory)' },
  { email: 'ivan@cleanpro.rs', label: 'Vendor — CleanPro Chemicals (no inventory, custom statuses, at plan limit, upgrade requested); also a buyer at Café Lipa' },
  { email: 'milica@aurora-hotels.rs', label: 'Buyer — Hotel Aurora Group (2 vendors, 3 locations)' },
  { email: 'nikola@cafelipa.rs', label: 'Buyer — Café Lipa (1 vendor, 1 location)' },
  { email: 'stefan@aurora-hotels.rs', label: 'Kupac — Hotel Aurora Group (interfejs na srpskom / Serbian UI)' },
  { email: 'admin@narudzbine.rs', label: 'Platform Admin — all vendors and buyers (web only)', webOnly: true },
];

export const DEMO_INVITE_TOKENS = {
  newBuyer: 'demo-buyer-invite',
  existingBuyer: 'demo-existing-buyer-invite',
  team: 'demo-team-invite',
} as const;

const CLEANPRO_STATUSES: OrderStatus[] = [
  { key: 'received', label: 'Received', isTerminal: false, isCancelled: false },
  { key: 'picking', label: 'Picking', isTerminal: false, isCancelled: false },
  { key: 'out_for_delivery', label: 'Out for delivery', isTerminal: false, isCancelled: false },
  { key: 'delivered', label: 'Delivered', isTerminal: true, isCancelled: false },
  { key: 'cancelled', label: 'Cancelled', isTerminal: true, isCancelled: true },
];

type ProductSeed = [
  id: string,
  name: string,
  sku: string,
  categoryId: string,
  tagIds: string[],
  basePrice: number,
  unit: string,
  stock: number | null,
  extra?: Partial<Product>,
];

function products(vendorOrgId: string, rows: ProductSeed[]): Product[] {
  return rows.map(([id, name, sku, categoryId, tagIds, basePrice, unit, stock, extra]) => ({
    id,
    vendorOrgId,
    name,
    sku,
    categoryId,
    tagIds,
    basePrice,
    unit,
    ...(stock === null ? {} : { stock }),
    // Demo pictures for about half the products; the rest exercise the placeholder.
    ...(PRODUCT_IMAGES[id] ? { imageUrl: PRODUCT_IMAGES[id] } : {}),
    isActive: true,
    ...extra,
  }));
}

export function buildSeed(now: Date): MockDb {
  const day = 86_400_000;
  const at = (daysOffset: number, hour = 10) => {
    const d = new Date(now.getTime() + daysOffset * day);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  // Subscription tiers: config/subscriptionTiers.ts (v1.1), not seed data.

  // ── Platform Admin (v1.1: one seeded account, no signup or invite flow) ──
  const platformAdmins = [
    { id: 'pa_sanja', email: 'admin@narudzbine.rs', name: 'Sanja Kovačević', preferredLocale: 'en' as const, createdAt: at(-500) },
  ];
  // CleanPro is at its Starter limit (10/10 products) and has asked for Growth: the admin's pending queue.
  const upgradeRequests = [
    { id: 'tur_cleanpro_growth', vendorOrgId: 'vo_cleanpro', requestedTierId: 'tier_growth', message: 'We are adding a dishwashing line in October and need room for about 30 more products.', status: 'pending' as const, createdAt: at(-2) },
    { id: 'tur_papirko_pro', vendorOrgId: 'vo_papirko', requestedTierId: 'tier_pro', message: 'Asking early — expect to pass 250 SKUs next year.', status: 'dismissed' as const, createdAt: at(-60), resolvedAt: at(-58) },
    { id: 'tur_papirko_growth', vendorOrgId: 'vo_papirko', requestedTierId: 'tier_growth', status: 'fulfilled' as const, createdAt: at(-400), resolvedAt: at(-399), appliedTierId: 'tier_growth' },
  ];

  // ── Vendors ───────────────────────────────────────────────────────────
  const vendorOrgs = [
    { id: 'vo_papirko', name: 'Papirko Wholesale', subscriptionTierId: 'tier_growth', tracksInventory: true, createdAt: at(-420) },
    { id: 'vo_cleanpro', name: 'CleanPro Chemicals', subscriptionTierId: 'tier_starter', tracksInventory: false, createdAt: at(-200) },
  ];
  const vendorLocations = [
    { id: 'vl_papirko_nbg', vendorOrgId: 'vo_papirko', name: 'Main warehouse — Novi Beograd', address: 'Autoput za Zagreb 22, 11070 Novi Beograd' },
    { id: 'vl_papirko_ns', vendorOrgId: 'vo_papirko', name: 'Novi Sad depot', address: 'Industrijska 9, 21000 Novi Sad' },
    { id: 'vl_cleanpro_zemun', vendorOrgId: 'vo_cleanpro', name: 'Zemun warehouse', address: 'Batajnički drum 14, 11080 Zemun' },
  ];
  const vendorUsers = [
    { id: 'vu_marko', vendorOrgId: 'vo_papirko', email: 'marko@papirko.rs', name: 'Marko Petrović', homeLocationId: 'vl_papirko_nbg', preferredLocale: 'en' as const, createdAt: at(-420) },
    { id: 'vu_ana', vendorOrgId: 'vo_papirko', email: 'ana@papirko.rs', name: 'Ana Jovanović', homeLocationId: 'vl_papirko_ns', preferredLocale: 'sr-Latn' as const, createdAt: at(-300) },
    { id: 'vu_ivan', vendorOrgId: 'vo_cleanpro', email: 'ivan@cleanpro.rs', name: 'Ivan Nikolić', preferredLocale: 'en' as const, createdAt: at(-200) },
  ];

  // ── Buyers ────────────────────────────────────────────────────────────
  const buyerOrgs = [
    { id: 'bo_aurora', name: 'Hotel Aurora Group', createdAt: at(-380) },
    { id: 'bo_lipa', name: 'Café Lipa', createdAt: at(-250) },
    { id: 'bo_sunce', name: 'Kindergarten Sunce', createdAt: at(-150) },
  ];
  const locations = [
    { id: 'loc_aurora_central', buyerOrgId: 'bo_aurora', name: 'Aurora Central', address: 'Knez Mihailova 12, 11000 Beograd' },
    { id: 'loc_aurora_river', buyerOrgId: 'bo_aurora', name: 'Aurora Riverside', address: 'Karađorđeva 48, 11000 Beograd' },
    { id: 'loc_aurora_ns', buyerOrgId: 'bo_aurora', name: 'Aurora Novi Sad', address: 'Bulevar oslobođenja 5, 21000 Novi Sad' },
    { id: 'loc_lipa', buyerOrgId: 'bo_lipa', name: 'Café Lipa', address: 'Cara Dušana 21, 11080 Zemun' },
    { id: 'loc_sunce', buyerOrgId: 'bo_sunce', name: 'Sunce — main building', address: 'Bulevar Mihajla Pupina 10, 11070 Novi Beograd' },
  ];
  const buyerUsers = [
    { id: 'bu_milica', buyerOrgId: 'bo_aurora', email: 'milica@aurora-hotels.rs', name: 'Milica Stanković', homeLocationId: 'loc_aurora_central', preferredLocale: 'en' as const, createdAt: at(-380) },
    { id: 'bu_stefan', buyerOrgId: 'bo_aurora', email: 'stefan@aurora-hotels.rs', name: 'Stefan Ilić', homeLocationId: 'loc_aurora_river', preferredLocale: 'sr-Latn' as const, createdAt: at(-340) },
    { id: 'bu_jovana', buyerOrgId: 'bo_aurora', email: 'jovana@aurora-hotels.rs', name: 'Jovana Marković', preferredLocale: 'sr-Latn' as const, createdAt: at(-90) },
    { id: 'bu_nikola', buyerOrgId: 'bo_lipa', email: 'nikola@cafelipa.rs', name: 'Nikola Đorđević', homeLocationId: 'loc_lipa', preferredLocale: 'en' as const, createdAt: at(-250) },
    // Ivan runs CleanPro and co-owns Café Lipa: one login, a vendor AND a buyer membership (org switcher).
    { id: 'bu_ivan', buyerOrgId: 'bo_lipa', email: 'ivan@cleanpro.rs', name: 'Ivan Nikolić', homeLocationId: 'loc_lipa', preferredLocale: 'en' as const, createdAt: at(-120) },
    { id: 'bu_dragana', buyerOrgId: 'bo_sunce', email: 'dragana@vrticsunce.rs', name: 'Dragana Popović', homeLocationId: 'loc_sunce', preferredLocale: 'en' as const, createdAt: at(-150) },
  ];
  const relations = [
    { id: 'rel_1', vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_aurora', status: 'active' as const, joinedAt: at(-380) },
    { id: 'rel_2', vendorOrgId: 'vo_cleanpro', buyerOrgId: 'bo_aurora', status: 'active' as const, joinedAt: at(-190) },
    { id: 'rel_3', vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_lipa', status: 'active' as const, joinedAt: at(-250) },
    { id: 'rel_4', vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_sunce', status: 'active' as const, joinedAt: at(-150) },
    // Existing buyer invited by a second vendor, not yet accepted:
    { id: 'rel_5', vendorOrgId: 'vo_cleanpro', buyerOrgId: 'bo_lipa', status: 'invited' as const },
  ];
  const invites = [
    { id: 'inv_1', type: 'buyer_org_invite' as const, email: 'nabavka@hostelmost.rs', token: DEMO_INVITE_TOKENS.newBuyer, status: 'pending' as const, vendorOrgId: 'vo_papirko', sentAt: at(-2) },
    { id: 'inv_2', type: 'buyer_org_invite' as const, email: 'nikola@cafelipa.rs', token: DEMO_INVITE_TOKENS.existingBuyer, status: 'pending' as const, vendorOrgId: 'vo_cleanpro', sentAt: at(-1) },
    { id: 'inv_3', type: 'team_member_invite' as const, email: 'luka@aurora-hotels.rs', token: DEMO_INVITE_TOKENS.team, status: 'pending' as const, targetOrgId: 'bo_aurora', targetOrgType: 'buyer' as const, sentAt: at(-3) },
    { id: 'inv_4', type: 'team_member_invite' as const, email: 'ana@papirko.rs', token: 'old-accepted-invite', status: 'accepted' as const, targetOrgId: 'vo_papirko', targetOrgType: 'vendor' as const, sentAt: at(-301), acceptedAt: at(-300) },
  ];

  // ── Catalogue: Papirko (inventory ON) ────────────────────────────────
  const categories = [
    { id: 'cat_tp', vendorOrgId: 'vo_papirko', name: 'Toilet paper' },
    { id: 'cat_towels', vendorOrgId: 'vo_papirko', name: 'Paper towels' },
    { id: 'cat_napkins', vendorOrgId: 'vo_papirko', name: 'Napkins' },
    { id: 'cat_soap', vendorOrgId: 'vo_papirko', name: 'Soap & dispensers' },
    { id: 'cat_bags', vendorOrgId: 'vo_papirko', name: 'Bags & liners' },
    { id: 'cat_gloves', vendorOrgId: 'vo_papirko', name: 'Gloves' },
    { id: 'cat_cp_floor', vendorOrgId: 'vo_cleanpro', name: 'Floor care' },
    { id: 'cat_cp_surface', vendorOrgId: 'vo_cleanpro', name: 'Surfaces & glass' },
    { id: 'cat_cp_kitchen', vendorOrgId: 'vo_cleanpro', name: 'Kitchen & dish' },
    { id: 'cat_cp_tools', vendorOrgId: 'vo_cleanpro', name: 'Tools & cloths' },
  ];
  const tags = [
    { id: 'tag_eco', vendorOrgId: 'vo_papirko', name: 'Eco' },
    { id: 'tag_best', vendorOrgId: 'vo_papirko', name: 'Bestseller' },
    { id: 'tag_hotel', vendorOrgId: 'vo_papirko', name: 'Hotel line' },
    { id: 'tag_bulk', vendorOrgId: 'vo_papirko', name: 'Bulk pack' },
    { id: 'tag_cp_conc', vendorOrgId: 'vo_cleanpro', name: 'Concentrate' },
    { id: 'tag_cp_haccp', vendorOrgId: 'vo_cleanpro', name: 'HACCP approved' },
  ];
  const papirkoProducts = products('vo_papirko', [
    ['p_tp_3ply48', 'Toilet paper 3-ply, 48 rolls', 'TP-3P-48', 'cat_tp', ['tag_best', 'tag_hotel'], 37.0, 'case', 340, { minOrderQuantity: 2, description: 'Soft 3-ply, 150 sheets per roll. Our most popular hotel-grade roll.' }],
    ['p_tp_2ply96', 'Toilet paper 2-ply, 96 rolls', 'TP-2P-96', 'cat_tp', ['tag_bulk'], 47.9, 'case', 120],
    ['p_tp_jumbo', 'Jumbo roll toilet paper, 12 × 200 m', 'TP-JR-12', 'cat_tp', ['tag_bulk'], 41.1, 'case', 8, { description: 'For jumbo dispensers in high-traffic washrooms.' }],
    ['p_tp_recycled', 'Recycled toilet paper 2-ply, 64 rolls', 'TP-RC-64', 'cat_tp', ['tag_eco'], 32.1, 'case', 210, { description: '100% recycled fibre, EU Ecolabel.' }],
    ['p_tw_zfold', 'Z-fold hand towels, 20 × 200 sheets', 'TW-ZF-4000', 'cat_towels', ['tag_best'], 44.6, 'case', 185],
    ['p_tw_centre', 'Centrefeed paper roll, 6 × 150 m', 'TW-CF-6', 'cat_towels', [], 38.3, 'case', 96],
    ['p_tw_kitchen', 'Kitchen roll 2-ply, 32 rolls', 'TW-KR-32', 'cat_towels', ['tag_eco'], 27.8, 'case', 0],
    ['p_nap_33', 'Napkins 33×33 white 2-ply, 2000 pcs', 'NP-33W-2000', 'cat_napkins', ['tag_hotel'], 24.6, 'case', 450],
    ['p_nap_24', 'Cocktail napkins 24×24, 3000 pcs', 'NP-24-3000', 'cat_napkins', [], 19.2, 'case', 260],
    ['p_nap_dinner', 'Dinner napkins 40×40 airlaid, bordeaux, 600 pcs', 'NP-40B-600', 'cat_napkins', ['tag_hotel'], 53.6, 'case', 64],
    ['p_soap_foam5', 'Foam hand soap, 5 L', 'SP-FM-5L', 'cat_soap', ['tag_best'], 23.3, 'can', 140],
    ['p_soap_disp', 'Foam soap dispenser, wall-mounted', 'SP-DSP-W', 'cat_soap', [], 34.2, 'piece', 35],
    ['p_soap_sanit', 'Hand sanitizer gel, 1 L', 'SP-SAN-1L', 'cat_soap', [], 12.5, 'bottle', 12, { minOrderQuantity: 6 }],
    ['p_bag_120', 'Trash bags 120 L heavy duty, 10 × 25', 'BG-120-HD', 'cat_bags', ['tag_bulk'], 29.9, 'case', 220],
    ['p_bag_60', 'Trash bags 60 L, 20 × 50', 'BG-60', 'cat_bags', ['tag_eco'], 26.8, 'case', 180],
    ['p_glv_nitrile', 'Nitrile gloves size M, 10 × 100', 'GL-NIT-M', 'cat_gloves', [], 82.1, 'case', 58],
    ['p_glv_vinyl', 'Vinyl gloves size L, 10 × 100', 'GL-VIN-L', 'cat_gloves', [], 57.7, 'case', 0, { isActive: false, description: 'Discontinued — replaced by nitrile.' }],
  ]);

  // ── Catalogue: CleanPro (inventory OFF → no stock field at all) ──────
  const cleanproProducts = products('vo_cleanpro', [
    ['p_cp_floor5', 'Floor cleaner concentrate, 5 L', 'FC-5L', 'cat_cp_floor', ['tag_cp_conc'], 28.4, 'can', null],
    ['p_cp_floor10', 'Floor cleaner concentrate, 10 L', 'FC-10L', 'cat_cp_floor', ['tag_cp_conc'], 50.9, 'can', null],
    ['p_cp_glass', 'Glass cleaner spray, 750 ml', 'GC-750', 'cat_cp_surface', [], 6.3, 'bottle', null, { minOrderQuantity: 12 }],
    ['p_cp_disinf', 'Surface disinfectant, 5 L', 'SD-5L', 'cat_cp_surface', ['tag_cp_haccp'], 38.7, 'can', null],
    ['p_cp_degreaser', 'Kitchen degreaser, 5 L', 'KD-5L', 'cat_cp_kitchen', ['tag_cp_haccp', 'tag_cp_conc'], 34.0, 'can', null],
    ['p_cp_dish', 'Dishwasher detergent, 12 kg', 'DW-12', 'cat_cp_kitchen', ['tag_cp_haccp'], 76.1, 'drum', null],
    ['p_cp_rinse', 'Rinse aid, 5 L', 'RA-5L', 'cat_cp_kitchen', [], 31.7, 'can', null],
    ['p_cp_mop', 'Microfibre mop head, 40 cm', 'MP-40', 'cat_cp_tools', [], 11.0, 'piece', null],
    ['p_cp_cloth', 'Microfibre cloths, 10-pack', 'MC-10', 'cat_cp_tools', [], 15.5, 'pack', null],
    ['p_cp_bucket', 'Mop bucket with wringer, 25 L', 'BK-25', 'cat_cp_tools', [], 66.5, 'piece', null],
  ]);
  const allProducts = [...papirkoProducts, ...cleanproProducts];

  const priceTiers: PriceTier[] = [
    { id: 'pt_1', productId: 'p_tw_zfold', minQty: 10, pricePerUnit: 42.1 },
    { id: 'pt_2', productId: 'p_tw_zfold', minQty: 50, pricePerUnit: 38.9 },
    { id: 'pt_3', productId: 'p_bag_120', minQty: 10, pricePerUnit: 27.8 },
    { id: 'pt_4', productId: 'p_bag_120', minQty: 40, pricePerUnit: 25.6 },
    { id: 'pt_5', productId: 'p_nap_33', minQty: 20, pricePerUnit: 22.3 },
    { id: 'pt_6', productId: 'p_cp_floor5', minQty: 6, pricePerUnit: 25.8 },
    { id: 'pt_7', productId: 'p_cp_floor5', minQty: 24, pricePerUnit: 23.7 },
  ];
  const buyerPrices: BuyerProductPrice[] = [
    { id: 'bp_1', vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_aurora', productId: 'p_soap_foam5', price: 19.9 },
    { id: 'bp_2', vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_aurora', productId: 'p_tp_3ply48', price: 34.0 },
    { id: 'bp_3', vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_lipa', productId: 'p_nap_33', price: 23.3 },
  ];

  // ── Merchandising ─────────────────────────────────────────────────────
  const featured = [
    { id: 'fp_1', vendorOrgId: 'vo_papirko', productId: 'p_tw_zfold', position: 0 },
    { id: 'fp_2', vendorOrgId: 'vo_papirko', productId: 'p_nap_dinner', position: 1 },
    { id: 'fp_3', vendorOrgId: 'vo_papirko', productId: 'p_tp_recycled', position: 2 },
    { id: 'fp_4', vendorOrgId: 'vo_cleanpro', productId: 'p_cp_dish', position: 0 },
    { id: 'fp_5', vendorOrgId: 'vo_cleanpro', productId: 'p_cp_floor5', position: 1 },
  ];
  const promotions: Promotion[] = [
    { id: 'promo_napkins', vendorOrgId: 'vo_papirko', type: 'percentage', value: 10, scope: 'category', scopeIds: ['cat_napkins'], startDate: at(-10, 0), endDate: at(30, 23), isActive: true },
    { id: 'promo_lipa_welcome', vendorOrgId: 'vo_papirko', type: 'percentage', value: 5, scope: 'buyer', scopeIds: ['bo_lipa'], startDate: at(-5, 0), endDate: at(25, 23), isActive: true },
    { id: 'promo_summer_tp', vendorOrgId: 'vo_papirko', type: 'fixed', value: 3.9, scope: 'product', scopeIds: ['p_tp_2ply96'], startDate: at(-120, 0), endDate: at(-60, 23), isActive: true },
    // Phase 6: one of each remaining state for the promotions list — scheduled and paused (neither affects today's prices).
    { id: 'promo_gloves_next', vendorOrgId: 'vo_papirko', type: 'percentage', value: 15, scope: 'category', scopeIds: ['cat_gloves'], startDate: at(7, 0), endDate: at(21, 23), isActive: true },
    { id: 'promo_centre_paused', vendorOrgId: 'vo_papirko', type: 'fixed', value: 2, scope: 'product', scopeIds: ['p_tw_centre'], startDate: at(-2, 0), endDate: at(28, 23), isActive: false },
    { id: 'promo_disinf', vendorOrgId: 'vo_cleanpro', type: 'fixed', value: 2.9, scope: 'product', scopeIds: ['p_cp_disinf'], startDate: at(-3, 0), endDate: at(14, 23), isActive: true },
  ];

  const statusConfigs = [
    { vendorOrgId: 'vo_papirko', statuses: DEFAULT_ORDER_STATUSES.map((s) => ({ ...s })) },
    { vendorOrgId: 'vo_cleanpro', statuses: CLEANPRO_STATUSES },
  ];

  // ── Order history (deterministic) ────────────────────────────────────
  const rand = mulberry32(20260927);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const orders: Order[] = [];
  let orderSeq = 1000;

  interface HistoryPlan {
    vendorOrgId: string;
    buyerOrgId: string;
    count: number;
    spanDays: number;
    /** Habitual products (weighted by repetition) — drives "most ordered". */
    habits: string[];
    qty: [min: number, max: number];
    fulfilling: string[];
  }
  const plans: HistoryPlan[] = [
    {
      vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_aurora', count: 26, spanDays: 180,
      habits: ['p_tp_3ply48', 'p_tp_3ply48', 'p_tp_3ply48', 'p_tw_zfold', 'p_tw_zfold', 'p_soap_foam5', 'p_soap_foam5', 'p_nap_33', 'p_nap_dinner', 'p_bag_120', 'p_bag_60', 'p_glv_nitrile'],
      qty: [4, 30], fulfilling: ['vl_papirko_nbg', 'vl_papirko_nbg', 'vl_papirko_ns'],
    },
    {
      vendorOrgId: 'vo_cleanpro', buyerOrgId: 'bo_aurora', count: 9, spanDays: 170,
      habits: ['p_cp_dish', 'p_cp_dish', 'p_cp_floor5', 'p_cp_floor5', 'p_cp_disinf', 'p_cp_degreaser', 'p_cp_rinse', 'p_cp_cloth'],
      qty: [2, 12], fulfilling: ['vl_cleanpro_zemun'],
    },
    {
      vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_lipa', count: 10, spanDays: 160,
      habits: ['p_nap_33', 'p_nap_33', 'p_nap_24', 'p_nap_24', 'p_tw_kitchen', 'p_soap_foam5', 'p_bag_60'],
      qty: [1, 8], fulfilling: ['vl_papirko_nbg'],
    },
    {
      vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_sunce', count: 7, spanDays: 140,
      habits: ['p_tp_recycled', 'p_tp_recycled', 'p_tw_zfold', 'p_soap_sanit', 'p_soap_foam5', 'p_glv_nitrile'],
      qty: [2, 10], fulfilling: ['vl_papirko_nbg'],
    },
  ];

  const statusFor = (statuses: OrderStatus[], ageDays: number): string => {
    const open = statuses.filter((s) => !s.isTerminal);
    const done = statuses.find((s) => s.isTerminal && !s.isCancelled)!;
    const cancelled = statuses.find((s) => s.isCancelled)!;
    if (ageDays > 6) return rand() < 0.08 ? cancelled.key : done.key;
    // Recent orders spread across the open statuses, newest at the first one.
    const idx = Math.min(open.length - 1, Math.floor((ageDays / 6) * open.length));
    return open[idx]!.key;
  };

  for (const plan of plans) {
    const users = buyerUsers.filter((u) => u.buyerOrgId === plan.buyerOrgId);
    const locs = locations.filter((l) => l.buyerOrgId === plan.buyerOrgId);
    const statuses = statusConfigs.find((c) => c.vendorOrgId === plan.vendorOrgId)!.statuses;
    for (let i = 0; i < plan.count; i++) {
      // Oldest first; guarantee the newest couple are within the last few days.
      const ageDays = i >= plan.count - 3
        ? (plan.count - 1 - i) * 1.5 + rand() * 0.8
        : plan.spanDays * (1 - i / plan.count) + rand() * 4;
      const createdAt = new Date(now.getTime() - ageDays * day);
      const user = pick(users);
      const locationId = user.homeLocationId && rand() < 0.75 ? user.homeLocationId : pick(locs).id;
      const id = `ord_${orderSeq++}`;
      const lineCount = 2 + Math.floor(rand() * 4);
      const productIds = new Set<string>();
      while (productIds.size < lineCount) productIds.add(pick(plan.habits));
      const items = [...productIds].map((productId, n) => {
        const product = allProducts.find((p) => p.id === productId)!;
        const quantity = Math.max(product.minOrderQuantity ?? 1, plan.qty[0] + Math.floor(rand() * (plan.qty[1] - plan.qty[0])));
        const price = resolvePrice({
          product, quantity, buyerOrgId: plan.buyerOrgId, tiers: priceTiers,
          overrides: buyerPrices, promotions, now: createdAt,
        });
        return { id: `${id}_i${n}`, orderId: id, productId, quantity, priceAtOrder: price.unitPrice };
      });
      const statusKey = statusFor(statuses, ageDays);
      orders.push({
        id,
        vendorOrgId: plan.vendorOrgId,
        buyerOrgId: plan.buyerOrgId,
        locationId,
        fulfillingLocationId: pick(plan.fulfilling),
        createdByUserId: user.id,
        statusKey,
        items,
        createdAt: createdAt.toISOString(),
        updatedAt: new Date(createdAt.getTime() + (statusKey === statuses[0]!.key ? 0 : day * 0.5)).toISOString(),
      });
    }
  }
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // ── Messages on a few orders ─────────────────────────────────────────
  const auroraPapirko = orders.filter((o) => o.buyerOrgId === 'bo_aurora' && o.vendorOrgId === 'vo_papirko');
  const latest = auroraPapirko[0]!;
  const second = auroraPapirko[1]!;
  const auroraCleanpro = orders.find((o) => o.buyerOrgId === 'bo_aurora' && o.vendorOrgId === 'vo_cleanpro')!;
  const plus = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
  const messages: OrderMessage[] = [
    { id: 'msg_1', orderId: latest.id, senderUserId: latest.createdByUserId, senderOrgType: 'buyer', text: 'Hi — could this go out before Friday? We have a conference weekend at Central.', createdAt: plus(latest.createdAt, 20) },
    { id: 'msg_2', orderId: latest.id, senderUserId: 'vu_marko', senderOrgType: 'vendor', text: 'Yes, it will be on Thursday morning’s truck.', createdAt: plus(latest.createdAt, 95) },
    { id: 'msg_3', orderId: second.id, senderUserId: 'vu_ana', senderOrgType: 'vendor', text: 'Dinner napkins are coming from the Novi Sad depot, the rest from Novi Beograd — two deliveries.', createdAt: plus(second.createdAt, 60) },
    { id: 'msg_4', orderId: auroraCleanpro.id, senderUserId: 'bu_stefan', senderOrgType: 'buyer', text: 'Please leave at the Riverside service entrance.', createdAt: plus(auroraCleanpro.createdAt, 10) },
  ];

  // ── Buyer conveniences ───────────────────────────────────────────────
  const favorites = [
    { id: 'fav_1', buyerUserId: 'bu_milica', productId: 'p_tw_zfold' },
    { id: 'fav_2', buyerUserId: 'bu_milica', productId: 'p_soap_foam5' },
    { id: 'fav_3', buyerUserId: 'bu_milica', productId: 'p_nap_dinner' },
    { id: 'fav_4', buyerUserId: 'bu_milica', productId: 'p_cp_dish' },
    { id: 'fav_5', buyerUserId: 'bu_nikola', productId: 'p_nap_33' },
  ];
  const draftCarts = [
    { id: 'dc_1', buyerOrgId: 'bo_aurora', vendorOrgId: 'vo_papirko', locationId: 'loc_aurora_river', createdByUserId: 'bu_stefan', items: [{ productId: 'p_tp_3ply48', quantity: 20 }, { productId: 'p_bag_120', quantity: 12 }, { productId: 'p_soap_foam5', quantity: 6 }], updatedAt: at(-1, 16) },
    { id: 'dc_2', buyerOrgId: 'bo_aurora', vendorOrgId: 'vo_papirko', locationId: 'loc_aurora_central', createdByUserId: 'bu_milica', items: [{ productId: 'p_nap_dinner', quantity: 8 }, { productId: 'p_tw_zfold', quantity: 10 }], updatedAt: at(-3, 11) },
    { id: 'dc_3', buyerOrgId: 'bo_aurora', vendorOrgId: 'vo_cleanpro', locationId: 'loc_aurora_ns', createdByUserId: 'bu_jovana', items: [{ productId: 'p_cp_floor5', quantity: 6 }], updatedAt: at(-6, 9) },
  ];

  const notificationPrefs = [
    { userId: 'bu_milica', userType: 'buyer' as const, notificationType: 'promotion_pushed' as const, channel: 'push' as const, enabled: false },
    { userId: 'vu_marko', userType: 'vendor' as const, notificationType: 'order_message_received' as const, channel: 'email' as const, enabled: false },
  ];

  const passwords: Record<string, string> = {};
  for (const u of [...vendorUsers, ...buyerUsers, ...platformAdmins]) passwords[u.email] = MOCK_PASSWORD;

  return {
    platformAdmins,
    upgradeRequests,
    vendorOrgs,
    vendorLocations,
    vendorUsers,
    buyerOrgs,
    locations,
    buyerUsers,
    relations,
    invites,
    categories,
    tags,
    products: allProducts,
    priceTiers,
    buyerPrices,
    featured,
    promotions,
    statusConfigs,
    orders,
    messages,
    favorites,
    draftCarts,
    notificationPrefs,
    passwords,
  };
}
