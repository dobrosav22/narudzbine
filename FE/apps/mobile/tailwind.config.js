// NativeWind v4 (Tailwind v3). Colours, radius and fonts come from the shared
// preset — the palette lives once in packages/ui/tokens.cjs (docs/05 §5).
// Don't add colours here; add tokens there so apps/web gets them too.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset'), require('@repo/ui/tailwind-preset').native],
  theme: {
    extend: {},
  },
  plugins: [],
};
