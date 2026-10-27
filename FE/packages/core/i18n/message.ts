import { IntlMessageFormat } from 'intl-messageformat';
import { en } from './resources.gen';

/**
 * A translatable message: a key into i18n/*.json plus ICU values. Shared code (validation,
 * descriptions, service errors) returns these instead of English text; each app turns them
 * into words with its own t() (02 "Internationalization": no locale branching in components).
 *
 * Numbers inside messages are passed pre-formatted (formatNumber/formatMoney, regional
 * LOCALE), alongside a raw `count` where a plural needs selecting — so digits look the same
 * in both UI languages.
 */
export interface Msg {
  key: string;
  values?: Record<string, string | number>;
}

export function msg(key: string, values?: Record<string, string | number>): Msg {
  return values ? { key, values } : { key };
}

function lookup(tree: unknown, key: string): string | undefined {
  let node: unknown = tree;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * English text for a message — for Error.message, logs and tests. Screens never show this;
 * they translate `Msg` with the viewer's locale. Unknown keys come back as the key itself.
 */
export function renderEnglish(m: Msg): string {
  const source = lookup(en, m.key);
  if (source === undefined) return m.key;
  return String(new IntlMessageFormat(source, 'en').format(m.values));
}

/** Exported for the key-parity test and scripts. */
export { lookup as lookupMessage };
