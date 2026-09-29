/**
 * Runtime access to the tokens for the few native APIs that take a colour
 * value instead of a className (ActivityIndicator, RefreshControl, navigation
 * theme, status bar). Derived from tokens.cjs — not a second palette.
 */
const { colors } = require('./tokens.cjs');
const { toHex } = require('./color.cjs');

function hexPalette(mode) {
  const palette = colors[mode];
  return Object.fromEntries(Object.entries(palette).map(([name, value]) => [name, toHex(value, palette.background)]));
}

module.exports = {
  nativeColors: { light: hexPalette('light'), dark: hexPalette('dark') },
};
