# download-tp

`tools/download-tp` scrapes TP with puppeteer and records the site's own API
responses as local JSON files, for later import by `tools/import-tp`. It is a
one-time operation per historical season, run locally by a developer — it is
never deployed.

## What it does

For each configured tournament it drives a real Chrome through the tournament's
frontend pages (news, scores, classifications, honours, statistics, players,
awards), plus every match page and every participant roster page it finds, and
records every response whose URL starts with the configured TP API base URL.
Where TP paginates (phase rounds, participant categories), it fetches the
missing pages from inside the already-open page so they reuse its session.

Downloaded files land in `tools/download-tp/data/<tournament>/`, one folder per
configured tournament, which is gitignored. That layout matches
`tools/import-tp/data/<era>/<competition>/` one level down, so importing a
downloaded tournament is a plain folder copy into the right era directory.

## Configuration

Copy the template and edit it:

```bash
cp tools/download-tp/download-tp-config.example.json5 tools/download-tp/download-tp-config.json5
```

| Key | Meaning |
| --- | --- |
| `connection.frontendUrl` | Base URL of the TP frontend, including a trailing slash (required) |
| `connection.backendApiUrl` | Base URL of the TP API, including a trailing slash — responses whose URL starts with it are recorded (required) |
| `browser.headless` | `true` to run the browser headless, `false` to show it (default `false`) |
| `download.tournaments` | Tournament names to download, as they appear in the frontend path (required, non-empty) |

`download-tp-config.json5` is git-ignored; only the `.example` template is
committed. Relative paths resolve against the working directory, which is
`tools/download-tp/` when the tool is run as documented below.

Running headless is known to produce spurious console errors from TP's service
worker (`A bad HTTP response code (403) was received when fetching the script.`,
`Service worker registration failed with: JSHandle@error`) — they do not affect
the recorded responses.

## Running it

The tool drives a real Chrome via puppeteer. pnpm does not run puppeteer's
install script (its browser download is deliberately not in the workspace's
`allowBuilds` list, to keep CI installs fast), so provision a browser once:

```bash
pnpm exec puppeteer browsers install chrome
```

Then build and run from the tool's directory:

```bash
pnpm --filter @blood-bowl-tracker/download-tp run build
pnpm --filter @blood-bowl-tracker/download-tp run start
```

A missing or incomplete config fails fast with a message naming the key to set,
before any browser is launched.

## Development

```bash
pnpm --filter @blood-bowl-tracker/download-tp run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/download-tp run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/download-tp run verify      # build + lint + typecheck + format + test
```
