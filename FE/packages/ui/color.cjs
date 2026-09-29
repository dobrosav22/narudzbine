/**
 * OKLCH → sRGB for platforms that can't read oklch() (React Native).
 * Standard OKLab matrices (Björn Ottosson); out-of-gamut channels are clamped,
 * the same fallback browsers use for P3-wide Tailwind v4 colors on sRGB screens.
 */

function parseOklch(value) {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/.exec(value);
  if (!m) throw new Error(`Not an oklch() color: ${value}`);
  const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
  return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]), alpha };
}

const toSrgb = (x) => {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
};

/** @returns {{ r: number, g: number, b: number, alpha: number }} 0–255 channels */
function oklchToRgb(value) {
  const { l, c, h, alpha } = parseOklch(value);
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: toSrgb(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: toSrgb(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: toSrgb(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
    alpha,
  };
}

/**
 * "r g b" channels for `rgb(var(--x) / <alpha-value>)`. A token with its own
 * alpha (e.g. dark border = white at 10%) is pre-blended over `background`,
 * since the channel format can't carry alpha of its own.
 */
function toChannels(value, background) {
  const fg = oklchToRgb(value);
  if (fg.alpha >= 1) return `${fg.r} ${fg.g} ${fg.b}`;
  const bg = oklchToRgb(background);
  const mix = (f, b) => Math.round(f * fg.alpha + b * (1 - fg.alpha));
  return `${mix(fg.r, bg.r)} ${mix(fg.g, bg.g)} ${mix(fg.b, bg.b)}`;
}

function toHex(value, background) {
  return '#' + toChannels(value, background).split(' ').map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

module.exports = { oklchToRgb, toChannels, toHex };
