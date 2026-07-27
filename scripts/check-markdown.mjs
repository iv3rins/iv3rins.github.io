import { readFile, readdir } from 'node:fs/promises';
import { relative } from 'node:path';

const root = new URL('../', import.meta.url);
const files = (await walk(root)).filter((url) => url.pathname.endsWith('.md') && !url.pathname.includes('/references/'));
const errors = [];

for (const file of files) {
  const path = relative(root.pathname, file.pathname);
  const lines = (await readFile(file, 'utf8')).split('\n');
  let h1Count = 0;
  let previousLevel = 0;
  let inFence = false;
  lines.forEach((line, index) => {
    if (line.startsWith('```')) inFence = !inFence;
    if (/\s+$/.test(line)) errors.push(`${path}:${index + 1} trailing whitespace`);
    if (inFence) return;
    const heading = /^(#{1,6})\s+/.exec(line);
    if (!heading) return;
    const level = heading[1]?.length ?? 0;
    if (level === 1) h1Count += 1;
    if (previousLevel > 0 && level > previousLevel + 1) {
      errors.push(`${path}:${index + 1} heading level jumps from ${previousLevel} to ${level}`);
    }
    previousLevel = level;
  });
  if (h1Count !== 1) errors.push(`${path}: expected exactly one H1, found ${h1Count}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Markdown verification passed (${files.length} files).`);

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
