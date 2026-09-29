/**
 * One-off helper: (re)writes services/real/<name>.ts with a notImplemented()
 * stub for every method of each AppServices entry. Run after adding a new
 * service or method:  pnpm --filter @repo/core exec tsx scripts/generate-real-stubs.ts
 * It skips files that already exist unless --force, so hand-written real
 * implementations are never overwritten.
 */
import ts from 'typescript';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const force = process.argv.includes('--force');
const program = ts.createProgram([join(root, 'services/index.ts')], { strict: true });
const checker = program.getTypeChecker();
const indexFile = program.getSourceFile(join(root, 'services/index.ts'))!;

const appServices = indexFile.statements.find(
  (s): s is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(s) && s.name.text === 'AppServices',
)!;

const exportLines: string[] = [];
for (const member of appServices.members) {
  if (!ts.isPropertySignature(member) || !member.type) continue;
  const key = (member.name as ts.Identifier).text;
  const typeName = member.type.getText(indexFile);
  const type = checker.getTypeAtLocation(member.type);
  const decl = type.getSymbol()?.declarations?.[0];
  const module = decl ? './' + decl.getSourceFile().fileName.split('/services/')[1]!.replace(/\.ts$/, '') : '';
  const methods = type.getProperties().map((p) => p.name);

  const file = join(root, 'services/real', `${key}.ts`);
  exportLines.push(`export { ${key}Service } from './${key}';`);
  if (existsSync(file) && !force) continue;

  const body = methods.map((m) => `  ${m}: async () => notImplemented('${key}.${m}'),`).join('\n');
  writeFileSync(
    file,
    `import type { ${typeName} } from '.${module}';\n` +
      `import { notImplemented } from '../../errors';\n\n` +
      `// Real implementation pending the backend — see 04-data-contract-api-outline.md.\n` +
      `// Replace each stub with a real call when its endpoint exists.\n` +
      `export const ${key}Service: ${typeName} = {\n${body}\n};\n`,
  );
}

writeFileSync(join(root, 'services/real/index.ts'), exportLines.join('\n') + '\n');
console.log(`Wrote services/real for: ${exportLines.length} services`);
