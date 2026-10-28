// NativeWind v4 (Tailwind v3). Colours, radius and fonts come from the shared
// preset — the palette lives once in packages/ui/tokens.cjs (docs/05 §5).
// Don't add colours here; add tokens there so apps/web gets them too.
/** @type {import('tailwindcss').Config} */
module.exports = {
  // Not 'media': on web, react-native-css-interop 0.2.7 calls colorScheme.set() once the
  // stylesheet loads, which throws under 'media'. The preset's prefers-color-scheme variables
  // still follow the system on every platform; nothing sets the scheme manually.
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset'), require('@repo/ui/tailwind-preset').native],
  theme: {
    extend: {},
  },
  plugins: [],
};
