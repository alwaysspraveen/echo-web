# Security Policy

## Supported versions

Only the **latest release** gets security fixes. Installed apps update themselves (Settings → Check for updates).

## Reporting a vulnerability

Please **don't** open a public issue for security problems.

Report it privately instead: on [github.com/alwaysspraveen/resona](https://github.com/alwaysspraveen/resona) go to **Security → Report a vulnerability**. Include:

- what the problem is and what an attacker could do with it
- steps to reproduce (or a proof of concept)
- the Resona version and your OS

You'll get a reply within 7 days. Once a fix ships, you'll be credited in the release notes if you'd like.

## Scope

In scope: the desktop app, its built-in server, the web app, and the update mechanism.

Out of scope: third-party services Resona connects to (YouTube Music, extension servers, LRCLIB, Apple Music, Listen Together servers). Report those to their owners.

## How Resona limits risk

- The desktop app's server isn't reachable from the network; pages and the API run on a private `app://` scheme.
- While casting, a small server opens on your Wi-Fi that serves only the current song, behind a random per-session token, and closes when casting stops.
- The web pages have no access to Node.js or your files (context isolation and sandboxing are on).
- Audio from extension servers is only proxied for links those servers returned.
