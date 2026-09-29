// Generates the demo product pictures used by the mock seed (mocks/productImages.ts).
// Flat pictograms (roll, towels, napkins, bottle, canister, spray, bag) on a soft category
// tint — PNG, not SVG, because React Native's <Image> can't render SVG without extra deps,
// and inlined as data URIs so they work offline on web, Expo web and a device alike.
// Deliberately no brand violet (05 §4): these are content, not brand moments.
//
//   node packages/core/scripts/generate-product-images.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 240;
const SS = 3; // supersampling factor for smooth edges

// ── Tiny rasterizer (RGB, supersampled) ─────────────────────────────────
function canvas(bg) {
  const w = SIZE * SS;
  const px = new Float32Array(w * w * 3);
  for (let i = 0; i < w * w; i++) px.set(bg, i * 3);
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= w) return;
    px.set(c, (y * w + x) * 3);
  };
  const s = (v) => v * SS;
  return {
    w,
    px,
    /** Fill every pixel whose centre (in 240-space) satisfies `inside`. */
    fill(inside, c, [x0, y0, x1, y1] = [0, 0, SIZE, SIZE]) {
      for (let y = Math.max(0, Math.floor(s(y0))); y < Math.min(w, Math.ceil(s(y1))); y++)
        for (let x = Math.max(0, Math.floor(s(x0))); x < Math.min(w, Math.ceil(s(x1))); x++)
          if (inside((x + 0.5) / SS, (y + 0.5) / SS)) put(x, y, c);
    },
  };
}
const circle = (cx, cy, r) => [(x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, [cx - r, cy - r, cx + r, cy + r]];
const ring = (cx, cy, r, t) => [(x, y) => { const d = Math.hypot(x - cx, y - cy); return d <= r && d >= r - t; }, [cx - r, cy - r, cx + r, cy + r]];
function rrect(x0, y0, x1, y1, r) {
  return [
    (x, y) => {
      const cx = Math.min(Math.max(x, x0 + r), x1 - r);
      const cy = Math.min(Math.max(y, y0 + r), y1 - r);
      return x >= x0 && x <= x1 && y >= y0 && y <= y1 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    },
    [x0, y0, x1, y1],
  ];
}
function poly(points) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return [
    (x, y) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    },
    [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  ];
}
const draw = (cv, [inside, box], c) => cv.fill(inside, c, box);

function toPng(cv) {
  // Box-downsample SS×SS → 1, then PNG (RGB, filter 0 rows, zlib).
  const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 3 + 1)] = 0;
    for (let x = 0; x < SIZE; x++)
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) sum += cv.px[((y * SS + dy) * cv.w + (x * SS + dx)) * 3 + ch];
        raw[y * (SIZE * 3 + 1) + 1 + x * 3 + ch] = Math.round(sum / (SS * SS));
      }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ── Palette (Tailwind 100/400/700-ish, no violet) ───────────────────────
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const WHITE = hex('#ffffff'), PAPER = hex('#f8fafc'), SHADE = hex('#e2e8f0');
const TINT = {
  blue: [hex('#dbeafe'), hex('#60a5fa'), hex('#1d4ed8')],
  green: [hex('#dcfce7'), hex('#4ade80'), hex('#15803d')],
  amber: [hex('#fef3c7'), hex('#fbbf24'), hex('#b45309')],
  rose: [hex('#ffe4e6'), hex('#fb7185'), hex('#9f1239')],
  cyan: [hex('#cffafe'), hex('#22d3ee'), hex('#0e7490')],
  teal: [hex('#ccfbf1'), hex('#2dd4bf'), hex('#0f766e')],
  slate: [hex('#e2e8f0'), hex('#94a3b8'), hex('#334155')],
  orange: [hex('#ffedd5'), hex('#fb923c'), hex('#c2410c')],
};

// ── Pictograms ──────────────────────────────────────────────────────────
function roll([bg, mid, dark]) {
  const cv = canvas(bg);
  draw(cv, rrect(120, 150, 196, 172, 4), SHADE); // unrolled tail
  draw(cv, circle(120, 120, 62), WHITE);
  draw(cv, ring(120, 120, 62, 3), SHADE);
  draw(cv, circle(120, 120, 24), mid);
  draw(cv, circle(120, 120, 13), dark);
  return cv;
}
function towels([bg, mid]) {
  const cv = canvas(bg);
  for (const [i, dy] of [62, 98, 134].entries()) {
    draw(cv, rrect(52 + i * 4, dy, 188 - i * 4, dy + 44, 8), i === 1 ? PAPER : WHITE);
    draw(cv, rrect(52 + i * 4, dy + 38, 188 - i * 4, dy + 44, 3), SHADE);
  }
  draw(cv, rrect(52, 62, 188, 70, 4), mid);
  return cv;
}
function napkins([bg, mid]) {
  const cv = canvas(bg);
  draw(cv, rrect(58, 70, 182, 194, 10), SHADE);
  draw(cv, rrect(52, 58, 176, 182, 10), WHITE);
  draw(cv, poly([[52, 58], [176, 58], [176, 182]]), PAPER);
  draw(cv, poly([[176, 58], [176, 182], [52, 182]].map(([x, y]) => [x, y])), WHITE);
  draw(cv, poly([[118, 120], [176, 58], [176, 182]]), mid);
  return cv;
}
function bottle([bg, mid, dark]) {
  const cv = canvas(bg);
  draw(cv, rrect(104, 34, 136, 60, 5), dark); // cap
  draw(cv, rrect(110, 58, 130, 78, 3), WHITE); // neck
  draw(cv, rrect(78, 74, 162, 206, 22), WHITE); // body
  draw(cv, rrect(88, 116, 152, 168, 8), mid); // label
  draw(cv, rrect(98, 132, 142, 138, 3), WHITE);
  draw(cv, rrect(98, 146, 128, 152, 3), WHITE);
  return cv;
}
function canister([bg, mid, dark]) {
  const cv = canvas(bg);
  draw(cv, ring(142, 70, 26, 10), WHITE); // handle
  draw(cv, rrect(62, 72, 186, 206, 20), WHITE); // body
  draw(cv, rrect(74, 50, 104, 76, 4), dark); // cap
  draw(cv, rrect(78, 118, 170, 178, 10), mid); // label
  draw(cv, rrect(92, 136, 156, 144, 4), WHITE);
  draw(cv, rrect(92, 152, 136, 160, 4), WHITE);
  return cv;
}
function spray([bg, mid, dark]) {
  const cv = canvas(bg);
  draw(cv, poly([[92, 40], [150, 40], [160, 62], [110, 62], [104, 84], [90, 84]]), dark); // trigger head
  draw(cv, rrect(96, 80, 132, 96, 3), dark);
  draw(cv, rrect(84, 94, 146, 208, 18), WHITE);
  draw(cv, rrect(94, 128, 136, 176, 8), mid);
  return cv;
}
function bag([bg, mid, dark]) {
  const cv = canvas(bg);
  draw(cv, poly([[96, 40], [120, 68], [144, 40], [138, 76], [102, 76]]), dark); // tie
  draw(cv, rrect(58, 70, 182, 206, 30), dark);
  draw(cv, rrect(76, 96, 92, 170, 8), mid); // sheen
  return cv;
}

const IMAGES = {
  p_tp_3ply48: roll(TINT.blue),
  p_tp_2ply96: roll(TINT.slate),
  p_tp_recycled: roll(TINT.green),
  p_tw_zfold: towels(TINT.cyan),
  p_tw_kitchen: towels(TINT.amber),
  p_nap_33: napkins(TINT.slate),
  p_nap_dinner: napkins(TINT.rose),
  p_soap_foam5: canister(TINT.cyan),
  p_soap_sanit: bottle(TINT.teal),
  p_bag_60: bag(TINT.green),
  p_bag_120: bag(TINT.slate),
  p_cp_floor5: canister(TINT.orange),
  p_cp_disinf: canister(TINT.teal),
  p_cp_glass: spray(TINT.blue),
  p_cp_rinse: bottle(TINT.amber),
};

const lines = Object.entries(IMAGES).map(([id, cv]) => `  ${id}: 'data:image/png;base64,${toPng(cv).toString('base64')}',`);
const out = `// GENERATED by scripts/generate-product-images.mjs — do not edit by hand.
// Demo pictures for some seeded products; the rest have none, so screens show both
// the image and the placeholder path. Mock data only.
export const PRODUCT_IMAGES: Record<string, string> = {
${lines.join('\n')}
};
`;
const target = new URL('../mocks/productImages.ts', import.meta.url);
writeFileSync(target, out);
const bytes = Buffer.byteLength(out);
console.log(`wrote ${Object.keys(IMAGES).length} images, ${(bytes / 1024).toFixed(1)} KB → mocks/productImages.ts`);

// Preview sheet for eyeballing (not committed): pass a path.
if (process.argv[2]) {
  for (const [id, cv] of Object.entries(IMAGES)) writeFileSync(`${process.argv[2]}/${id}.png`, toPng(cv));
}
