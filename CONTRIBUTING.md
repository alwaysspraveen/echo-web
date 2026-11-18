# Contributing to Resona

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Reporting bugs and ideas

Use [Issues](https://github.com/alwaysspraveen/resona/issues) and pick **Bug report** or **Feature request**. For bugs, include your Resona version (Settings → App updates), your OS, and the steps to make it happen.

Security problems: see [SECURITY.md](SECURITY.md). Please don't post them publicly.

## Setting up

Needs **Node.js 22 or newer**.

```sh
npm install
npm run dev        # web app + local server; open the URL Vite prints
```

Desktop app: see "Desktop app (Electron)" in the [README](README.md).

## Project layout

- `apps/web`: the React app (Vite, Tailwind, shadcn/ui, Zustand, TanStack Query, Dexie)
- `apps/server`: the API (Hono + youtubei.js)
- `apps/desktop`: the Electron app (also Cast and in-app updates)
- `packages/shared`: types shared by the server and the web app

## Before you open a pull request

```sh
npm test            # unit tests
npm run typecheck   # server + web
```

- Keep pull requests focused: one fix or feature each.
- Match the existing style: TypeScript, small components, comments that explain *why*.
- UI text is plain, sentence-case English. Name things by what people see ("Save for offline"), not by how they're built.
- New features should work with both mouse and keyboard, and look right in every color theme.
- Don't add trackers, analytics or ads. See the [Privacy Policy](PRIVACY_POLICY.md).
- Never break saved data: library, playlists, downloads and settings must survive an update.

## Releases

Maintainers publish releases with `./scripts/release.sh <version>`. Installed apps pick them up automatically.

## Code of conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
