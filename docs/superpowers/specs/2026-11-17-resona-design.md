# Resona — design

A music app for laptops. Runs locally now; must later be hostable or wrappable in Electron without a rewrite.

## Scope (v1)
- Search (songs, albums, artists, playlists) with suggestions
- Playback: stream audio, queue, next/prev, shuffle, repeat, seek, volume, autoplay radio when the queue ends
- Home feed shelves, album, artist and playlist pages
- Synced lyrics (LRCLIB), with plain-lyrics fallback
- Local library: liked songs, play history, user playlists (stored in the browser, no sign-in)

Out of scope for v1: YouTube account sign-in, downloads/offline, other lyrics providers, canvas/video, Electron packaging, hosting.

## Architecture
npm workspace at `echo-web/`:
- `packages/shared` — TypeScript types shared by both sides (`Track`, `AlbumCard`, `Shelf`, `AlbumPage`, `ArtistPage`, `PlaylistPage`, `Lyrics`, `SearchResults`).
- `apps/server` — Node + Hono + youtubei.js. Converts YouTube Music responses into the shared types, so the frontend never sees YouTube's raw format.
- `apps/web` — Vite + React + TypeScript + Tailwind + shadcn/ui (restyled), TanStack Query, Zustand, React Router, Dexie (IndexedDB).

### Server API (all JSON unless noted)
| Route | Returns |
|---|---|
| `GET /api/home` | `Shelf[]` |
| `GET /api/search?q=` | `SearchResults` |
| `GET /api/suggest?q=` | `string[]` |
| `GET /api/album/:id` | `AlbumPage` |
| `GET /api/artist/:id` | `ArtistPage` |
| `GET /api/playlist/:id` | `PlaylistPage` |
| `GET /api/radio/:videoId` | `Track[]` (up-next / autoplay) |
| `GET /api/lyrics?title=&artist=&duration=` | `Lyrics` or 404 |
| `GET /api/stream/:videoId` | audio bytes, proxied with Range support |

### Audio streaming
The server resolves an audio-only format (YTMUSIC client first, IOS client as fallback) and proxies bytes from googlevideo, forwarding the `Range` header so seeking works. Resolved URLs are cached in memory for 1 hour. Player script deciphering runs in a `node:vm` sandbox with a timeout.

### Frontend state
- Zustand `player` store: queue, current index, shuffle order, repeat mode, volume; persisted to localStorage so a reload restores the queue.
- One `<audio>` element owned by a `PlayerEngine` component; the store drives it.
- Dexie DB `echo-web`: `liked`, `history`, `playlists`.

## Look
Design: dark base, translucent cards (`surface-variant` at 30% alpha), 24px radius, flat elevation, a glass (backdrop-blur) player bar, and the accent red `#ED5564`. Desktop layout: left sidebar (Home, Search, Library, playlists), main scroll area, bottom player bar, right panel that toggles between Queue and Lyrics.

## Errors
- Server returns `{ error }` with 4xx/5xx. Frontend shows inline error states with Retry.
- If a stream fails, the player skips to the next track after showing a toast.
- No lyrics → "No lyrics found" empty state.

## Testing
- Vitest unit tests: LRC parser, player queue logic (next/prev/shuffle/repeat).
- Server smoke test script hitting each route against live YouTube Music.
- Manual check in the browser: search → play → seek → lyrics sync → like → playlist.
