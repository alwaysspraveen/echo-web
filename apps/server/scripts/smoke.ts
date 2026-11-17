// Hits every API route on a running server and prints a one-line result for each.
// Usage: npm run smoke   (server must be running on PORT, default 8787)
const base = `http://127.0.0.1:${process.env.PORT ?? 8787}/api`;
let failed = 0;
async function check(name: string, path: string, verify: (r: Response, body: any) => string) {
  try {
    const r = await fetch(base + path);
    const body = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer();
    console.log(`ok   ${name.padEnd(9)} ${verify(r, body)}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name.padEnd(9)} ${(e as Error).message}`);
  }
}
const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };

let songId = '', albumId = '', artistId = '', playlistId = '';
await check('search', '/search?q=coldplay', (_, b) => {
  must(b.songs?.length, 'no songs'); songId = b.songs[0].id; albumId = b.albums[0]?.id; artistId = b.artists[0]?.id; playlistId = b.playlists[0]?.id;
  return `${b.songs.length} songs, ${b.albums.length} albums, ${b.artists.length} artists, ${b.playlists.length} playlists`;
});
await check('suggest', '/suggest?q=coldp', (_, b) => { must(b.queries?.length && b.items?.length, 'empty'); return `${b.items.length} items (${b.items.map((i: any) => i.kind).join(',')}), queries: ${b.queries.slice(0, 3).join(' | ')}`; });
await check('home', '/home', (_, b) => { must(b.length, 'no shelves'); return `${b.length} shelves: ${b.slice(0, 3).map((s: any) => s.title).join(', ')}`; });
await check('album', `/album/${albumId}`, (_, b) => { must(b.tracks?.length, 'no tracks'); return `${b.title} by ${b.artist?.name}: ${b.tracks.length} tracks, art=${!!b.tracks[0].thumbnail}`; });
await check('artist', `/artist/${artistId}`, (_, b) => { must(b.topSongs?.length, 'no top songs'); return `${b.name}: ${b.topSongs.length} top songs, ${b.shelves.length} shelves`; });
await check('playlist', `/playlist/${playlistId}`, (_, b) => { must(b.tracks?.length, 'no tracks'); return `${b.title}: ${b.tracks.length} tracks, artists=${b.tracks[0].artists.map((a: any) => a.name).join(',')}`; });
await check('radio', `/radio/${songId}`, (_, b) => { must(b.length, 'empty'); return `${b.length} tracks`; });
await check('lyrics', '/lyrics?title=Blinding%20Lights&artist=The%20Weeknd&duration=200', (_, b) => { must(b.synced?.length, 'no synced'); return `${b.synced.length} synced lines`; });
await check('stream', `/stream/${songId}`, (r, b) => { must(r.status === 200 || r.status === 206, `status ${r.status}`); return `${r.status} ${r.headers.get('content-type')} ${(b as ArrayBuffer).byteLength} bytes`; });
try {
  const r = await fetch(`${base}/stream/${songId}`, { headers: { Range: 'bytes=100000-100999' } });
  const n = (await r.arrayBuffer()).byteLength;
  if (r.status !== 206 || n !== 1000) throw new Error(`status ${r.status}, ${n} bytes`);
  console.log(`ok   seek      206 ${r.headers.get('content-range')}`);
} catch (e) { failed++; console.log(`FAIL seek      ${(e as Error).message}`); }
process.exit(failed ? 1 : 0);
