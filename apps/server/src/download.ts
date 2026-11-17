import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchWholeAudio, type Quality } from './stream.ts';
import { allowedArtUrl, fetchArt } from './art.ts';

export interface DownloadRequest {
  id: string;
  /**
   * 'mp3' = 320 kbps MP3 encoded from the best source (default; plays everywhere),
   * 'opus' = original Opus ~160 kbps, 'm4a' = original AAC ~128 kbps.
   */
  format: 'mp3' | 'opus' | 'm4a';
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
}

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim();

/** "Artist - Title.ext", safe on macOS/Windows/Linux. */
export function fileName(title: string, artist: string | undefined, ext: string) {
  const base = clean(artist ? `${artist} - ${title}` : title).replace(/[\\/:*?"<>|]/g, '_').slice(0, 180) || 'track';
  return `${base}.${ext}`;
}

/** Vorbis-comment picture block (FLAC METADATA_BLOCK_PICTURE), how Ogg/Opus files carry cover art. */
function pictureBlock(image: Buffer, mime: string) {
  const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const m = Buffer.from(mime);
  return Buffer.concat([u32(3), u32(m.length), m, u32(0), u32(0), u32(0), u32(0), u32(0), u32(image.length), image]).toString('base64');
}

function runFfmpeg(args: string[], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // Arguments are passed as an array (no shell), so metadata can't inject commands.
    const p = spawn('ffmpeg', ['-v', 'error', '-y', ...args], { signal, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.slice(0, 300)}`))));
  });
}

export async function downloadTrack(req: DownloadRequest, signal: AbortSignal): Promise<Response> {
  const quality: Quality = req.format === 'm4a' ? 'normal' : 'high';
  const { bytes, mime } = await fetchWholeAudio(req.id, quality, signal);
  // The preferred source can be missing for a song; name copies after what we actually got.
  const isMp4 = mime.includes('mp4');
  const mp3 = req.format === 'mp3';
  const ext = mp3 ? 'mp3' : isMp4 ? 'm4a' : 'opus';

  const coverUrl = allowedArtUrl(req.cover);
  const cover = coverUrl ? await fetchArt(coverUrl, signal).catch(() => null) : null;

  const dir = await mkdtemp(join(tmpdir(), 'echo-dl-'));
  try {
    const input = join(dir, isMp4 ? 'in.m4a' : 'in.webm');
    const output = join(dir, `out.${ext}`);
    await writeFile(input, bytes);
    const meta = (k: string, v?: string) => (v ? ['-metadata', `${k}=${clean(v)}`] : []);
    const tags = [...meta('title', req.title), ...meta('artist', req.artist), ...meta('album', req.album), ...meta('comment', `https://music.youtube.com/watch?v=${req.id}`)];

    let out: Buffer;
    try {
      if (mp3) {
        // 320 kbps CBR at 44.1 kHz with ID3v2.3 tags: the most widely playable MP3 there is.
        const coverArgs: string[] = [];
        if (cover) {
          const coverPath = join(dir, 'cover.img');
          await writeFile(coverPath, Buffer.from(cover.bytes));
          coverArgs.push('-i', coverPath, '-map', '1', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic',
            '-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)');
        }
        await runFfmpeg(['-i', input, ...coverArgs, '-map', '0:a', '-c:a', 'libmp3lame', '-b:a', '320k', '-ar', '44100',
          '-id3v2_version', '3', ...tags, output], signal);
      } else if (isMp4) {
        const coverArgs: string[] = [];
        if (cover) {
          const coverPath = join(dir, cover.type.includes('png') ? 'cover.png' : 'cover.jpg');
          await writeFile(coverPath, Buffer.from(cover.bytes));
          coverArgs.push('-i', coverPath, '-map', '1', '-disposition:v', 'attached_pic');
        }
        await runFfmpeg(['-i', input, ...coverArgs, '-map', '0:a', '-c', 'copy', ...tags, '-movflags', '+faststart', output], signal);
      } else {
        const pic = cover ? ['-metadata', `METADATA_BLOCK_PICTURE=${pictureBlock(Buffer.from(cover.bytes), cover.type)}`] : [];
        await runFfmpeg(['-i', input, '-map', '0:a', '-c', 'copy', ...tags, ...pic, output], signal);
      }
      out = await readFile(output);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      if (mp3) return Response.json({ error: 'MP3 downloads need ffmpeg installed (brew install ffmpeg).' }, { status: 501 });
      out = bytes; // ffmpeg not installed: hand over the original stream untagged
    }

    const name = fileName(req.title, req.artist, out === bytes && !isMp4 ? 'webm' : ext);
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    return new Response(new Uint8Array(out), {
      headers: {
        'Content-Type': mp3 ? 'audio/mpeg' : isMp4 ? 'audio/mp4' : out === bytes ? 'audio/webm' : 'audio/ogg',
        'Content-Length': String(out.length),
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
