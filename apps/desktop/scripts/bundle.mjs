// Bundles the Electron main process and the API server (with youtubei.js etc.) into dist/.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
  logLevel: 'info',
  // Some bundled CommonJS dependencies call require(); give ESM output a working one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
};

await build({ ...common, entryPoints: [`${root}src/main.ts`], outfile: `${root}dist/main.js`, external: ['electron', './server.js'] });
await build({ ...common, entryPoints: [`${root}../server/src/app.ts`], outfile: `${root}dist/server.js` });
