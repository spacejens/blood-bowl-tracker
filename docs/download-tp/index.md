# download-tp

`tools/download-tp` fetches TP's API over plain HTTP and records the responses
as local JSON files, for later import by `tools/import-tp`. It is a one-time
operation per historical season, run locally by a developer — it is never
deployed.

## What it does

For each configured tournament it requests, in one continuous session, the
same API endpoints TP's own frontend requests for the tournament's pages
(news, scores, classifications, honours, statistics, players, awards), plus
every match and every participant roster those responses list. Where TP
paginates by phase, round or category (phases, classifications per phase,
inscriptions per category) it requests every phase, round and category
directly, each at that endpoint's first page — matching what the tool always
fetched. See
[Plain-HTTP fetching](#plain-http-fetching) for how requests are made and
which endpoints each page maps to.

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

| Key                        | Meaning                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `connection.frontendUrl`   | Base URL of the TP frontend, including a trailing slash (required)                                    |
| `connection.backendApiUrl` | Base URL of the TP API, including a trailing slash — every request goes to a path under it (required) |
| `download.tournaments`     | Tournament names to download, as they appear in the frontend path (required; may be empty)            |
| `download.rulesSets`       | Rules sets to download TP's official team list for (required; may be empty)                           |

`download-tp-config.json5` is git-ignored; only the `.example` template is
committed. It is looked up at `download-tp-config.json5` in the working
directory, which is `tools/download-tp/` when the tool is run as documented
below.

## Running it

Build and run from the tool's directory:

```bash
pnpm --filter @blood-bowl-tracker/download-tp run build
pnpm --filter @blood-bowl-tracker/download-tp run start
```

No browser is needed.

The official team list download runs first (see "What it does" above). It
reads `connection.frontendUrl` and `download.rulesSets` up front, and
`connection.backendApiUrl` when it builds the first request — so a missing or
incomplete value for any of those three fails fast, with a message naming the
key to set, before any request is sent. `download.tournaments` is only read
afterward, to decide whether to also run `downloadAllLeagues()` — so a missing
or incomplete value there is only caught once the official-teams download has
already run.

## Plain-HTTP fetching

Every request goes through `packages/scrape-tp` (see
[docs/scrape-tp/index.md](../scrape-tp/index.md)): Node's built-in `fetch()`
with a browser-like header set, no browser involved. `download-tp` originally
drove a real Chrome through puppeteer; an investigation on 2026-09-23 found
that TP's API accepts plain HTTP provided each request sends this header set,
sufficient though not individually isolated as necessary:

- `accept: application/json, text/plain, */*`
- `accept-language: en`
- `content-type: application/json`
- `priority: u=1, i`
- `sec-fetch-dest: empty`, `sec-fetch-mode: cors`, `sec-fetch-site: same-origin`
- `x-requested-with: XMLHttpRequest`
- `referer`: the frontend page URL the request belongs to
- `user-agent`: a Chrome 120 macOS string (the exact value is in
  `packages/scrape-tp/src/tp-fetcher.service.ts`)

A request with the `User-Agent` alone was rejected with a 403 response, no
`content-type` or `server` header, and a body of `Access denied.`.

The investigation validated this first against a tournament's honours page,
then against every request a full download of a small finished league
competition makes (38 requests: tournament pages, every fixtures round, every
match and every participant roster). Every request that also had a browser
capture to compare against (16 of the 38) returned identical JSON; the rest
(fixture rounds other than the current one, matches, rosters) returned 2xx
JSON whose match and roster counts matched an existing reference download
exactly. The switch to plain HTTP was then checked end to end: a full download
of that competition and all three official team lists produced output
byte-identical to the puppeteer-based tool's.

Each tournament's download uses one `scrape-tp` session, and the whole
official-team download (every configured rules set) shares one session too —
switching rules sets the way a user would switch tabs on the same page — so
cookies and pacing (a random 0.5–2 second gap between a session's requests)
carry across a download the way they would across one visit in a browser. The
investigation needed neither — 38 requests ran back-to-back with none
rejected — so they are there to keep the traffic looking like one person
browsing, not to work around an observed block.

Plain HTTP cannot click through pages or observe what a page requests, so
`download-tp` requests each page's endpoints directly. Paths are relative to
`connection.backendApiUrl`; `<slug>` is the tournament name from
`download.tournaments`; phase and category ids come from the
`tournament/<slug>` response's `categories`:

| Frontend page (sent as referer) | API requests                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `<slug>/news`                   | `tournament/<slug>`, `tournament/<slug>/news`                                                                                    |
| `<slug>/scores`                 | `tournament/<slug>/phases?page=0&pageSize=50&phaseId=<id>&type=COACH` per phase, plus `&round=<n>` per non-current round         |
| `<slug>/match/<id>`             | `match/<id>` for every match in those responses                                                                                  |
| `<slug>/classifications`        | `tournament/<slug>/clasifications?page=0&pageSize=75&phaseId=<id>&type=COACH` per phase (TP's own spelling)                      |
| `<slug>/honours`                | `tournament/<slug>/team-stats`; `tournament/<slug>/lineup-stats` (Player toggle); `tournament/<slug>/coach-stats` (Coach toggle) |
| `<slug>/statistics`             | `tournament/<slug>/statistics`                                                                                                   |
| `<slug>/players`                | `inscriptions/<slug>/category/<id>/inscriptions?page=0&pageSize=75` per category                                                 |
| `roster/<id>`                   | `rosters/<id>` for every roster in those responses                                                                               |
| `<slug>/awards`                 | `awards/<slug>/awards`                                                                                                           |
| `teams`                         | `rosters/masters?ruleSet=<id>` per configured rules set                                                                          |

The mapping was captured once from a real browser session. If TP's frontend
changes which endpoints a page calls, update
`tools/download-tp/src/downloader/tp-api-paths.service.ts` to match. Roster,
tournament (including inscriptions and awards), match, and official-teams
paths are the exception: they live in `packages/tp-paths`'
`TpRosterPathsService`, `TpTournamentPathsService`, `TpMatchPathsService` and
`TpOfficialTeamsPathsService`, shared with the live team and match imports
(see [docs/import-tp-live/index.md](../import-tp-live/index.md)).

Every response is written to a file named after its API path with `/`
replaced by `_` and `.json` appended — e.g. `tournament/<slug>/news` becomes
`tournament_<slug>_news.json` — which is the layout `tools/import-tp` reads.

## Development

```bash
pnpm --filter @blood-bowl-tracker/download-tp run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/download-tp run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/download-tp run verify      # build + lint + typecheck + format + test
```
