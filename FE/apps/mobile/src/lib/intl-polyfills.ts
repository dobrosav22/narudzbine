// Plural selection for ICU messages ("{count, plural, one {…} few {…} other {…}}") needs
// Intl.PluralRules, which Hermes may not ship. The polyfill only installs itself when the
// runtime lacks it (or lacks these locales), so on the web export this is a no-op.
// Imported first by the root layout, before any message is formatted.
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/sr.js';
