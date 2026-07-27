import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const violations = [];
const sourceFiles = await walk(new URL('.', root));

for (const fileUrl of sourceFiles) {
  const path = relative(new URL('.', root).pathname, fileUrl.pathname);
  if (!['.ts', '.js', '.mjs'].includes(extname(path))) continue;
  const text = await readFile(fileUrl, 'utf8');
  const imports = [...text.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map((match) => match[2]);

  if (path.startsWith('packages/domain/src/')) {
    for (const specifier of imports) {
      if (specifier?.startsWith('node:') || specifier?.startsWith('@pokewar/') || (!specifier?.startsWith('.') && specifier)) {
        violations.push(`${path}: domain cannot import ${specifier}`);
      }
    }
  }
  if (path.startsWith('apps/web/')) {
    for (const specifier of imports) {
      if (specifier?.includes('application') || specifier?.includes('persistence') || specifier?.includes('server')) {
        violations.push(`${path}: web cannot import ${specifier}`);
      }
    }
  }
  if ((path.startsWith('apps/web/src/') || path.endsWith('.css')) && /filter\s*:\s*invert\(/.test(text)) {
    violations.push(`${path}: filter: invert() is forbidden`);
  }
  if (/sort\s*\(\s*\(.*Math\.random/.test(text)) {
    violations.push(`${path}: random sort shuffle is forbidden`);
  }
  if (path.includes('/src/') && text.split('\n').length > 420) {
    violations.push(`${path}: source file exceeds 420 lines`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log(`Architecture verification passed (${sourceFiles.length} files scanned).`);

async function walk(directoryUrl) {
  const result = [];
  for (const entry of await readdir(directoryUrl, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directoryUrl);
    if (entry.isDirectory()) result.push(...(await walk(child)));
    else result.push(child);
  }
  return result;
}
