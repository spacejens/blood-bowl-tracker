# tp-paths

`packages/tp-paths` holds every TP path this repo requests, as TP's own
frontend requests them, and the reverse: deciding which kind of TP page a URL
points to. [download-tp](../download-tp/index.md),
[import-tp-live](../import-tp-live/index.md) and `apps/discord-bot` all depend
on it.

## Building requests

- It covers the roster, tournament (including the news, classifications,
  honours and statistics pages only `tools/download-tp` fetches), match and
  official-teams paths, plus the rules-set id map the official team list uses.
- Each path service builds a `TpRequest` — the API path, the full API URL and
  the full referer page URL — from the caller's `TpBaseUrls`, so no consumer
  pairs an API path with its page or prefixes a base URL itself.
- The request is then made through [scrape-tp](../scrape-tp/index.md), which
  deliberately knows no TP URLs.

## Classifying a URL

`TpPageClassifierService` classifies a TP frontend URL as a competition,
competition scores, match, roster or official-teams page (or unknown), with
the ids the matching `packages/import-tp-live` entry point needs. Every
on-demand consumer makes the same determination with it: `apps/discord-bot`
classifies a pasted URL for `/importtp` and a notification's link for the
[TP feed](../discord-bot/tp-feed.md).

## Pure and dependency-free

It is pure path building and matching with no I/O, and the frontend base URL
is a parameter, not config. It depends on no other workspace package, so the
client-only `tools/download-tp` and the server-side `packages/import-tp-live`
can both depend on it without either gaining the other's dependencies — one
of the deliberate two-sided packages at the
[client/server boundary](../architecture.md#clientserver-boundary).

## Development

```bash
pnpm --filter @blood-bowl-tracker/tp-paths run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/tp-paths run verify  # build + lint + typecheck + format + test
```
