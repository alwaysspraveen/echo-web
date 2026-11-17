# Echo Web

A laptop web version of [Echo Music](https://github.com/EchoMusicApp/Echo-Music): stream YouTube Music without ads, with synced lyrics, a play queue and a local library.

## Run it

Needs Node 22+.

```sh
npm install
npm run dev
```

Open the URL Vite prints (normally http://localhost:5173). `npm run dev` starts both:

- **web** (`apps/web`): the React app, on Vite's dev server
- **server** (`apps/server`): the API on http://127.0.0.1:8787. It talks to YouTube Music and LRCLIB and passes audio through to the browser.

Only localhost can reach the server. Set `HOST=0.0.0.0` (and `PORT`) only if you deliberately want other devices to reach it.

### Single-process mode

```sh
npm run build          # builds apps/web/dist
npm start -w apps/server
```

The server then also serves the built app on http://127.0.0.1:8787. Later, this is the process an Electron shell would launch.

## Settings

Open **Settings** at the bottom of the sidebar.

- **Theme:** *Match artwork* (the default) takes its colors from the cover of the song that's playing, like the Android app's dynamic color. You can also pick one of 8 fixed colors.
- **Streaming quality:** High (Opus ~160 kbps), Normal (AAC ~128 kbps) or Data saver (Opus ~70 kbps). Changing it mid-song keeps your position.
- **Download format:** Best quality `.opus` (~160 kbps), or `.m4a` (AAC ~128 kbps) for Apple Music and QuickTime. Downloads are saved to your browser's Downloads folder, tagged with title, artist, album and cover art. The audio is copied without re-encoding, so no quality is lost. Tagging needs `ffmpeg` on the PATH; without it you get the untagged original file.

Download a song from its right-click menu, the download button in the player bar, or the Now Playing view. There's no 320 kbps option because YouTube Music only serves that to Premium accounts.

## Keyboard shortcuts

| Key | Action |
|---|---|
| Space | Play / pause |
| ← / → | Seek 5 seconds |
| Shift + ← / → | Previous / next song |
| M | Mute |
| L | Like the current song |
| / | Search |
| Esc | Close the now-playing view |

Media keys and macOS Control Center work too, through the Media Session API.

## Checks

```sh
npm test            # queue + lyrics unit tests (Vitest)
npm run typecheck   # server + web
npm run smoke       # hits every API route against live YouTube Music (server must be running)
```

## How it works

- `packages/shared`: types shared by the server and the web app, plus the LRC lyrics parser.
- `apps/server`: Hono + [youtubei.js](https://github.com/LuanRT/YouTube.js). It converts YouTube Music responses into small, stable JSON shapes. Audio streams use the `VISIONOS` client, which serves the whole file without a PO token; this is the same client order Echo-Music uses in `YTPlayerUtils`. `/api/stream/:id` turns the browser's open-ended `Range` requests into bounded ones, because googlevideo rejects `bytes=0-`.
- `apps/web`: Vite, React, Tailwind, shadcn/ui (restyled to Echo's `DESIGN.md`), TanStack Query, Zustand and Dexie. Liked songs, history and playlists are stored in IndexedDB, in your browser only.

Design notes: `docs/superpowers/specs/2026-11-17-echo-web-design.md`.

## Known limits

- No YouTube account sign-in, and no offline playback inside the app yet (downloads are saved as files).
- If YouTube changes its streaming rules, `VISIONOS` may stop serving full files. The server falls back to other clients, which may give only a ~1 MB preview. Updating `youtubei.js` is the usual fix.
