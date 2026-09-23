# scrape-tp

`packages/scrape-tp` is the one place this repo's code makes HTTP requests to
TP. It sends plain-HTTP requests to TP's API that TP accepts as coming from a
browser, and keeps each logical visit's requests paced and cookie-consistent.
`tools/download-tp` uses it, and so does `packages/import-tp-live`, the live
team and match import the discord-bot's on-demand TP import builds on.

## Why it exists

TP rejects requests that do not look like they come from its own frontend.
`tools/download-tp` originally drove a real Chrome through puppeteer to get
past that, but an investigation found that a set of browser-like headers is
enough on its own (see
[download-tp's Plain-HTTP fetching](../download-tp/index.md#plain-http-fetching)).
Keeping that knowledge in one shared package means a second consumer cannot
drift out of sync with the first — and neither needs a browser, which is too
heavy to bundle into the discord-bot's server environment.

## Scope

Fetching only. The package knows how to make a request TP accepts and nothing
about TP's URLs: it reads no config file, holds no frontend or API base URL,
and has no mapping from frontend pages to API endpoints. Callers pass full
absolute URLs, and the referer that belongs to each request. It depends on no
other workspace package.

## Using it

Import `ScrapeTpModule` into the consuming module and inject
`TpFetcherService`:

```ts
const session = tpFetcherService.createSession();
const tournament = await session.fetch(
  'https://tourplay.net/api/tournament/some-league',
  { referer: 'https://tourplay.net/en/blood-bowl/some-league/news' },
);
```

- `createSession()` starts one logical visit — a whole tournament download,
  say, or one on-demand fetch of an entity. Create one per visit, not one per
  request: pacing and cookies only carry across requests in the same session.
  Make one request at a time on a session — pacing and the cookie jar are
  only meaningful in sequence, so concurrent calls on the same session (e.g.
  via `Promise.all`) are not supported.
- `session.fetch(url, options?)` makes one request and returns its body
  parsed as JSON, typed `unknown` for the caller to narrow. Options:
  `referer` (the TP frontend page URL the request belongs to — pass it on
  every request), `method` (default `GET`) and `body`.

## What a request does

- **Headers.** Every request carries the same browser-like header set:
  `accept`, `accept-language`, `content-type`, `priority`, `sec-fetch-dest`,
  `sec-fetch-mode`, `sec-fetch-site`, `x-requested-with` and a Chrome 120
  macOS `user-agent`, plus the caller's `referer`. The values are in
  `packages/scrape-tp/src/tp-fetcher.service.ts`.
- **Cookies.** Each `Set-Cookie` a response sends is stored in the session
  by name — a later value replaces an earlier one — and sent back as a
  `Cookie` header on the session's later requests. Cookie attributes
  (domain, path, expiry) are ignored: a session only ever talks to TP, and
  only lives for one visit.
- **Pacing.** Every request after a session's first waits until a random
  0.5–2 seconds have passed since the session's previous request completed.
  Time the caller already spent in between counts toward that. Separate
  sessions do not pace against each other.
- **Failure.** A non-2xx response throws, naming the URL and status; a 2xx
  body that is not valid JSON throws too; a request that takes longer than
  30 seconds is aborted and throws rather than hanging. There is no retry or
  backoff: the header set was reliable across 38 back-to-back requests, so
  there is no observed failure to retry for. Whether a failure aborts the
  caller's work is the caller's decision.

## Development

```bash
pnpm --filter @blood-bowl-tracker/scrape-tp run test        # unit tests with coverage
pnpm --filter @blood-bowl-tracker/scrape-tp run test:watch  # unit tests in watch mode
pnpm --filter @blood-bowl-tracker/scrape-tp run verify      # build + lint + typecheck + format + test
```
