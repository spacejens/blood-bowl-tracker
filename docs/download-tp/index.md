# download-tp

`tools/download-tp` fetches TP's API — over plain HTTP, or by driving a real
browser — and records the responses as local JSON files, for later import by
`tools/import-tp`. It is a one-time operation per historical season, run
locally by a developer — it is never deployed.

## What it does

For each configured tournament it downloads the TP API responses behind the
tournament's frontend pages (news, scores, classifications, honours,
statistics, players, awards), plus every match and every participant roster
those responses list. It does this by one of two methods, chosen by
`browser.enabled`:

- **Plain HTTP** (`false`) — requests, in one continuous session, the same API
  endpoints TP's own frontend requests for those pages. Where TP paginates by
  phase, round or category (phases, classifications per phase, inscriptions
  per category) it requests every phase, round and category directly, each at
  that endpoint's first page. See [Plain-HTTP fetching](#plain-http-fetching).
- **Real browser** (`true`) — drives Chrome through those pages and records
  every API response they make. See [Browser fetching](#browser-fetching).

Both methods write the same file names into the same folders, so
`tools/import-tp` imports a download regardless of the method that made it.

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

| Key                        | Meaning                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `connection.frontendUrl`   | Base URL of the TP frontend, including a trailing slash (required)                                                          |
| `connection.backendApiUrl` | Base URL of the TP API, including a trailing slash — every request goes to a path under it (required)                       |
| `browser.enabled`          | `true` to download by driving a real browser, `false` to fetch over plain HTTP (required; no default)                       |
| `browser.headless`         | Browser method only: `true` hides the browser, anything else shows it (optional; ignored when `browser.enabled` is `false`) |
| `download.tournaments`     | Tournament names to download, as they appear in the frontend path (required; may be empty)                                  |
| `download.rulesSets`       | Rules sets to download TP's official team list for (required; may be empty)                                                 |

`download-tp-config.json5` is git-ignored; only the `.example` template is
committed. It is looked up at `download-tp-config.json5` in the working
directory, which is `tools/download-tp/` when the tool is run as documented
below.

Running the browser method headless is known to produce spurious console
errors from TP's service worker (`A bad HTTP response code (403) was received
when fetching the script.`, `Service worker registration failed with:
JSHandle@error`) — they do not affect the recorded responses.

## Running it

Build and run from the tool's directory:

```bash
pnpm --filter @blood-bowl-tracker/download-tp run build
pnpm --filter @blood-bowl-tracker/download-tp run start
```

The plain-HTTP method (`browser.enabled: false`) needs nothing else. The
browser method (`browser.enabled: true`) drives a real Chrome via puppeteer.
pnpm does not run puppeteer's install script (its browser download is
deliberately declined in the workspace's `allowBuilds`, to keep CI installs
fast), so provision a browser once before the first browser download:

```bash
pnpm --filter @blood-bowl-tracker/download-tp exec puppeteer browsers install chrome
```

`browser.enabled` is read before anything else, so a missing or non-boolean
value fails with a message naming the key before any request is sent or any
browser launched. The official team list download runs next (see "What it
does" above). It reads `download.rulesSets` and `connection.frontendUrl` up
front, and `connection.backendApiUrl` before its first request or browser
launch — so a missing or incomplete value for any of those fails fast, with a
message naming the key to set. `download.tournaments` is only read afterward,
to decide whether to also download the tournaments — so a missing or
incomplete value there is only caught once the official-teams download has
already run.

With the plain-HTTP method, the download stops at the first request TP refuses
with 403 "Access denied" — TP blocking the client — printing when TP may next
be tried and exiting with status 1. There is no retry: run it again after that
time. Files written before the block are kept.

## Plain-HTTP fetching

With `browser.enabled: false`, every request goes through `packages/scrape-tp`
(see [docs/scrape-tp/index.md](../scrape-tp/index.md)): Node's built-in
`fetch()` with a browser-like header set, no browser involved. `download-tp`
originally only drove a real Chrome through puppeteer (still available as the
[browser method](#browser-fetching)); an investigation on 2026-09-23 found
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
cookies carry across a download the way they would across one visit in a
browser. Pacing (a random 0.5–2 second gap before every request) is shared by
every session in the process. The 2026-09-23 investigation needed neither —
38 requests ran back-to-back with none rejected — but live imports were later
refused with 403 `Access denied.`, so pacing also keeps independent imports
from bursting TP together, and a 403 pauses all TP traffic for a growing
back-off (see [scrape-tp](../scrape-tp/index.md#what-a-request-does)).

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

After live imports started being refused with 403 on 2026-09-29, three header
sets were tried from a developer machine, each as one request to
`tournament/<slug>` with the matching `referer`. Earlier that day, the Chrome
120 set above was sent to `tournament/ogretoberfest-14` (referer
`.../ogretoberfest-14/awards`). A later probe sent a Chrome 140 user agent with
`sec-ch-ua*` client hints to `tournament/tloegbbl-sasong-30` (referer
`.../tloegbbl-sasong-30/news`), and 30 seconds later that same set plus
`accept-encoding` and a fuller `accept-language` to the same URL. All three
were answered with 403 and the body `Access denied.`. Header changes alone
therefore do not get past TP from that network, so the header set is unchanged.
The probe did not show whether TP now refuses every non-browser client or has
blocked the addresses involved; a request that succeeds from a real browser on
the same network would separate the two.

## Browser fetching

With `browser.enabled: true`, `download-tp` drives a real Chrome through
puppeteer instead of building API requests itself. Each frontend page is
opened in a freshly launched browser — shown, or hidden when
`browser.headless` is `true` — that presents a Chrome 120 macOS user agent and
hides the automation flag. Every response whose URL starts with
`connection.backendApiUrl` is recorded, keyed by its path relative to that
URL. Console errors and warnings are printed; an uncaught error in the page
itself fails the download.

For each tournament the pages are visited in the order of the table under
[Plain-HTTP fetching](#plain-http-fetching): news, scores, every match the
scores responses list, classifications, honours, statistics, players, every
roster the players responses list, awards. Two pages need more than loading:

- On `<slug>/honours` it clicks the Team, Player and Coach toggles
  (`.mat-button-toggle-button`), so every view's stats request is made.
- A scores-page phase response carries only its current round's matches, so
  every other round listed in its `rounds[]` is requested from inside the open
  page — reusing its session and headers — with `&round=<n>` appended.

For the official team list it opens the `teams` page once per configured rules
set and requests that rules set's `rosters/masters?ruleSet=<id>` from inside
the page. Opening the page always loads its default tab's list too, so only
the wanted rules set's response is written.

Page paths and the rules-set id come from `packages/tp-paths`, shared with the
plain-HTTP method, and responses are written with the same file naming into
the same folders.

The browser method has no dedicated handling of TP blocking: it stops with an
error when an API response body is not JSON (such as a block page) or an
in-page follow-up request fails. The "TP is blocking" message and its
retry-time hint belong to the plain-HTTP method only.

## Development

```bash
pnpm --filter @blood-bowl-tracker/download-tp run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/download-tp run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/download-tp run verify      # build + lint + typecheck + format + test
```
