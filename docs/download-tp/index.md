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

It also downloads TP's canonical official team list — races, positions and
star players with their characteristics — once per configured rules set, into
`tools/download-tp/data/teams/<rulesSet>/`, a sibling of the per-tournament
folders. That list is independent of any played league, so it is the source
`tools/import-tp` uses for races, positions and star players.

## Configuration

Copy the template and edit it:

```bash
cp tools/download-tp/download-tp-config.example.json5 tools/download-tp/download-tp-config.json5
```

| Key                        | Meaning                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `connection.frontendUrl`   | Base URL of the TP frontend, including a trailing slash (required)                                              |
| `connection.backendApiUrl` | Base URL of the TP API, including a trailing slash — responses whose URL starts with it are recorded (required) |
| `browser.headless`         | `true` to run the browser headless, `false` to show it (default `false`)                                        |
| `download.tournaments`     | Tournament names to download, as they appear in the frontend path (required; may be empty)                      |
| `download.rulesSets`       | Rules sets to download TP's official team list for (required; may be empty)                                     |

`download-tp-config.json5` is git-ignored; only the `.example` template is
committed. It is looked up at `download-tp-config.json5` in the working
directory, which is `tools/download-tp/` when the tool is run as documented
below.

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

The official team list download runs first (see "What it does" above), and it
reads `connection.frontendUrl`, `connection.backendApiUrl` and
`download.rulesSets` up front, before opening a page for the first configured
rules set — so a missing or incomplete value for any of those three fails
fast, with a message naming the key to set, before any browser is launched.
`download.tournaments` is only read afterward, to decide whether to also run
`downloadAllLeagues()` — so a missing or incomplete value there is only
caught once the official-teams download has already run and launched a
browser (once per configured rules set).

## Plain-HTTP fetching

Puppeteer is used here because `download-tp` was built around a real browser,
not because TP requires one. An investigation on 2026-09-23 found that TP's
API can be fetched with plain HTTP — Node's built-in `fetch()`, no browser —
provided each request sends a browser-like set of headers, sufficient though
not individually isolated as necessary: `accept`, `accept-language`,
`content-type`, `priority`, `sec-fetch-dest`, `sec-fetch-mode`,
`sec-fetch-site`, `x-requested-with`, `user-agent` and `referer` — values:

- `accept: application/json, text/plain, */*`
- `accept-language: en`
- `content-type: application/json`
- `priority: u=1, i`
- `sec-fetch-dest: empty`, `sec-fetch-mode: cors`, `sec-fetch-site: same-origin`
- `x-requested-with: XMLHttpRequest`
- `referer`: the frontend page URL the request belongs to
- `user-agent`: the Chrome 120 macOS string `download-tp` already sets in
  `ApiResponseRecordingPageViewerService`

No cookies or request pacing were needed — 38 requests ran back-to-back with
none rejected. The `User-Agent` alone was rejected with a 403 response, no
`content-type` or `server` header, and a body of `Access denied.`.

It was validated first against a tournament's honours page, then against
every request a full download of a small finished league competition makes
(38 requests: tournament pages, every fixtures round, every match and every
participant roster — the official-teams/rules-set path was not exercised).
Every request that also had a browser capture to compare against (16 of the 38) returned identical JSON; the rest (fixture rounds other than the current
one, matches, rosters) returned 2xx JSON whose match and roster counts
matched an existing reference download exactly.

Plain HTTP cannot click, so anything TP's frontend loads on a button click has
to be requested directly by URL. On the honours page, the Team/Player/Coach
toggles request `tournament/<slug>/lineup-stats` (Player) and
`tournament/<slug>/coach-stats` (Coach), relative to the API base URL; the
default-selected Team toggle fires no separate request.

This makes a browser-free fetcher possible — one that can run inside the
discord-bot's server environment, where bundling Chrome is too heavy.

## Development

```bash
pnpm --filter @blood-bowl-tracker/download-tp run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/download-tp run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/download-tp run verify      # build + lint + typecheck + format + test
```
