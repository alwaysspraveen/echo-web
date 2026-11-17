// Downloads a static ffmpeg build for the target platform into vendor/<platform>-<arch>/.
// Uses the ffmpeg-static project's release binaries (GPL, https://github.com/eugeneware/ffmpeg-static).
import { createWriteStream, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const [platform = process.platform, arch = process.arch] = process.argv.slice(2);
const RELEASE = 'b6.1.1';
const dir = fileURLToPath(new URL(`../vendor/${platform}-${arch}/`, import.meta.url));
const out = `${dir}ffmpeg${platform === 'win32' ? '.exe' : ''}`;
if (existsSync(out)) { console.log(`ffmpeg already present: ${out}`); process.exit(0); }
mkdirSync(dir, { recursive: true });
const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}/ffmpeg-${platform}-${arch}.gz`;
console.log(`Downloading ${url}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`ffmpeg download failed: ${res.status}`);
await pipeline(Readable.fromWeb(res.body), createGunzip(), createWriteStream(out));
if (platform !== 'win32') chmodSync(out, 0o755);
console.log(`Saved ${out}`);
