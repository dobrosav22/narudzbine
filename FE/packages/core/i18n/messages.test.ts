import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { MESSAGES, SUPPORTED_LOCALES, type AppLocale } from './index';

// Guards for the shared translation files (02 "Internationalization"): every language has
// every key, every message is valid ICU, and translations use the same placeholders.

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === 'string') out.set(prefix + k, v);
    else for (const [kk, vv] of flatten(v, `${prefix}${k}.`)) out.set(kk, vv);
  }
  return out;
}

const flat = Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l.value, flatten(MESSAGES[l.value] as Tree)])) as Record<AppLocale, Map<string, string>>;
const en = flat.en;

// ICU AST element types (intl-messageformat): 1 argument, 2 number, 3 date, 4 time, 5 select, 6 plural, 8 tag.
interface El {
  type: number;
  value?: string;
  options?: Record<string, { value: El[] }>;
  children?: El[];
  pluralType?: 'cardinal' | 'ordinal';
}

/** Placeholder and tag names used anywhere in a message (e.g. "count", "countText", "<cart>"). */
function argsOf(ast: El[], out = new Set<string>()): Set<string> {
  for (const el of ast) {
    if (el.type >= 1 && el.type <= 6 && el.value) out.add(el.value);
    if (el.type === 8 && el.value) out.add(`<${el.value}>`);
    for (const o of Object.values(el.options ?? {})) argsOf(o.value, out);
    if (el.children) argsOf(el.children, out);
  }
  return out;
}

function plurals(ast: El[], out: El[] = []): El[] {
  for (const el of ast) {
    if (el.type === 6) out.push(el);
    for (const o of Object.values(el.options ?? {})) plurals(o.value, out);
    if (el.children) plurals(el.children, out);
  }
  return out;
}

const ast = (source: string, locale: string) => new IntlMessageFormat(source, locale).getAst() as unknown as El[];

test('every language has exactly the English keys', () => {
  for (const { value: locale } of SUPPORTED_LOCALES) {
    const keys = flat[locale];
    const missing = [...en.keys()].filter((k) => !keys.has(k));
    const extra = [...keys.keys()].filter((k) => !en.has(k));
    assert.deepEqual({ locale, missing, extra }, { locale, missing: [], extra: [] });
  }
});

test('every message is valid ICU, with the same placeholders as English', () => {
  for (const { value: locale } of SUPPORTED_LOCALES) {
    for (const [key, source] of flat[locale]) {
      let parsed: El[];
      try {
        parsed = ast(source, locale);
      } catch (e) {
        assert.fail(`${locale} ${key}: ${(e as Error).message}`);
      }
      assert.deepEqual([...argsOf(parsed)].sort(), [...argsOf(ast(en.get(key)!, 'en'))].sort(), `${locale} ${key}: placeholders differ from English`);
    }
  }
});

test('plurals cover the language\'s forms (Serbian: one / few / other)', () => {
  const required: Record<AppLocale, string[]> = { en: ['one', 'other'], 'sr-Latn': ['one', 'few', 'other'] };
  for (const { value: locale } of SUPPORTED_LOCALES) {
    for (const [key, source] of flat[locale]) {
      for (const p of plurals(ast(source, locale))) {
        const forms = Object.keys(p.options ?? {});
        for (const form of required[locale]) assert.ok(forms.includes(form), `${locale} ${key}: plural lacks "${form}"`);
      }
    }
  }
});

test('Serbian plural forms pick the right noun', () => {
  const t = (n: number) =>
    new IntlMessageFormat(MESSAGES['sr-Latn'].promotions.scopeCount.product, 'sr-Latn').format({ count: n, countText: String(n) });
  assert.equal(t(1), '1 proizvod');
  assert.equal(t(3), '3 proizvoda');
  assert.equal(t(21), '21 proizvod');
  assert.equal(t(12), '12 proizvoda');
});

test('every message formats with sample values in its language', () => {
  for (const { value: locale } of SUPPORTED_LOCALES) {
    for (const [key, source] of flat[locale]) {
      const values: Record<string, unknown> = {};
      for (const a of argsOf(ast(source, locale))) {
        if (a.startsWith('<')) values[a.slice(1, -1)] = (chunks: unknown[]) => chunks.join('');
        else values[a] = a === 'count' || a === 'n' ? 3 : 'x';
      }
      assert.doesNotThrow(() => new IntlMessageFormat(source, locale).format(values), `${locale} ${key}`);
    }
  }
});

/** Source files under a directory (no tests, no node_modules). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

test('keys named in shared code and apps exist in English', () => {
  const namespaces = new Set(Object.keys(MESSAGES.en));
  const root = resolve(__dirname, '..');
  const found: { file: string; key: string }[] = [];
  // Core: any quoted dotted literal starting with a namespace ("errors.notFound", LOCATION_COPY, …).
  // services/real names operations ("catalogue.listProducts"), not messages.
  for (const file of sources(root).filter((f) => !/[\\/]services[\\/]real[\\/]/.test(f))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/['"]([a-zA-Z]+(?:\.[\w-]+)+)['"]/g)) {
      if (namespaces.has(m[1]!.split('.')[0]!)) found.push({ file, key: m[1]! });
    }
  }
  // Apps: keys handed to countMsg()/msg() or written as a Msg literal ({ key: '…' }).
  for (const app of ['web', 'mobile']) {
    for (const file of sources(resolve(root, '../../apps', app, 'src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/(?:countMsg\(|\bmsg\(|key:\s*)['"]([a-zA-Z]+(?:\.[\w-]+)+)['"]/g)) {
        found.push({ file, key: m[1]! });
      }
    }
  }
  assert.ok(found.length > 100, 'the scan found keys');
  const missing = found.filter((f) => !en.has(f.key)).map((f) => `${f.key} (${f.file.slice(root.length - 'packages/core'.length)})`);
  assert.deepEqual(missing, []);
});
