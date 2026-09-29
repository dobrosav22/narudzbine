/**
 * Shared Tailwind preset (docs/05 §5). Both apps extend it; the palette lives
 * once, in tokens.cjs. It emits the same variable NAMES on both platforms,
 * encoded for what each can read:
 *
 *   web     Tailwind v4 via `@config` → OKLCH values; `.dark` class (next-themes).
 *           Colour utilities come from shadcn's `@theme inline` block in
 *           globals.css, which already maps --color-X → var(--X).
 *   native  NativeWind v4 (Tailwind v3) → "r g b" channels, used as
 *           rgb(var(--X) / <alpha-value>) so opacity modifiers (bg-success/15)
 *           work; dark = prefers-color-scheme (RN Appearance).
 */
const { colors, radius } = require('./tokens.cjs');
const { toChannels } = require('./color.cjs');

const tokenNames = Object.keys(colors.light);

function cssVars(mode, target) {
  const palette = colors[mode];
  return Object.fromEntries(
    tokenNames.map((name) => [
      `--${name}`,
      target === 'native' ? toChannels(palette[name], palette.background) : palette[name],
    ]),
  );
}

/** Plain function plugin — the API is the same in Tailwind v3 and v4's compat layer. */
const variablesPlugin = (target) => ({ addBase }) =>
  addBase(
    target === 'native'
      ? {
          ':root': cssVars('light', 'native'),
          '@media (prefers-color-scheme: dark)': { ':root': cssVars('dark', 'native') },
        }
      : {
          ':root': { ...cssVars('light', 'web'), '--radius': radius },
          '.dark': cssVars('dark', 'web'),
        },
  );

/** rem is 16px on web; NativeWind's default rem is 14, so native gets explicit px. */
const radiusPx = parseFloat(radius) * 16;

const web = {
  plugins: [variablesPlugin('web')],
};

const native = {
  theme: {
    extend: {
      colors: Object.fromEntries(tokenNames.map((name) => [name, `rgb(var(--${name}) / <alpha-value>)`])),
      // Same ratios as apps/web/src/app/globals.css (--radius-sm … --radius-xl).
      borderRadius: {
        sm: `${radiusPx * 0.6}px`,
        md: `${radiusPx * 0.8}px`,
        lg: `${radiusPx}px`,
        xl: `${radiusPx * 1.4}px`,
      },
      // 05 §2: Geist / Geist Mono. RN can't synthesise weights for custom fonts,
      // so each weight is its own family (loaded in apps/mobile/src/app/_layout.tsx).
      fontFamily: {
        sans: ['Geist_400Regular'],
        'sans-medium': ['Geist_500Medium'],
        'sans-semibold': ['Geist_600SemiBold'],
        mono: ['GeistMono_400Regular'],
        'mono-semibold': ['GeistMono_600SemiBold'],
      },
    },
  },
  plugins: [variablesPlugin('native')],
};

module.exports = { web, native };
