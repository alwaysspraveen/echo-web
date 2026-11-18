// Bundles the TV server for Node.js for Mobile (Node 18, built without ICU).
import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const rewritePattern = createRequire(import.meta.url)('regexpu-core');
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const out = `${root}android/app/src/main/assets/nodejs-project/main.mjs`;
await build({
  entryPoints: [`${root}server/entry.ts`],
  outfile: out,
  bundle: true, platform: 'node', target: 'node18', format: 'esm', logLevel: 'info',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
// Without ICU, V8 can't run Unicode property escapes like /\p{L}/u; expand them to plain ranges.
const code = await readFile(out, 'utf8');
const res = await transformAsync(code, {
  babelrc: false, configFile: false, compact: false, sourceType: 'module',
  plugins: ['@babel/plugin-transform-unicode-property-regex'],
});
// Patterns built at runtime from strings: new RegExp("...\\p{Emoji}...", "u").
const finalCode = res.code.replace(/new RegExp\(("(?:[^"\\\\]|\\\\.)*\\\\p\{(?:[^"\\\\]|\\\\.)*"), "u"\)/g, (_m, lit) =>
  `new RegExp(${JSON.stringify(rewritePattern(JSON.parse(lit), 'u', { unicodePropertyEscapes: 'transform' }))}, "u")`);
await writeFile(out, finalCode);
const left = finalCode.match(/\\p\{/g)?.length ?? 0;
if (left) throw new Error(`${left} Unicode property escapes left in the bundle`);
console.log('Unicode property escapes expanded');
