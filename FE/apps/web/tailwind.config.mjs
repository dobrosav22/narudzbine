// Loaded by globals.css via `@config`. The palette itself lives in
// packages/ui/tokens.cjs — both apps extend the same preset (docs/05 §5).
import sharedPreset from "@repo/ui/tailwind-preset";

const config = {
  presets: [sharedPreset.web],
};

export default config;
