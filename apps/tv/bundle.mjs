// Bundles the TV server for Node.js for Mobile (Node 18).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
await build({
  entryPoints: [`${root}server/entry.ts`],
  outfile: `${root}android/app/src/main/assets/nodejs-project/main.mjs`,
  bundle: true, platform: 'node', target: 'node18', format: 'esm', logLevel: 'info',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
