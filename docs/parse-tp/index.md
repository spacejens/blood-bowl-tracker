# parse-tp

`packages/parse-tp` is the reusable TP JSON-parsing logic — matches, rosters,
awards and tournaments — that decodes [download-tp](../download-tp/index.md)'s
files. [import-tp](../import-tp/index.md) and
[import-tp-live](../import-tp-live/index.md) both consume it, so a bulk and a
live import read TP the same way.

## Shared TP keys and rules

It also owns the TP keys and rules both import paths must agree on:

- **`TpStarHireKeyService`** — the hired-star external id, used by the one
  server-side hire import that bulk and live both reach.
- **`TpOfficialListingPrecedenceService`** — the official-over-legacy listing
  precedence.

## Typed with the contract's TP wire shapes

Its output is typed with `packages/api-contract`'s TP wire shapes wherever one
exists, rather than declared again here:

- Awards, official team list races and match-embedded players use the
  contract's shapes directly.
- Its own types are built from them: a roster player extends the
  match-embedded player, a parsed match extends the bracket match, and skill
  references, career SPP counts and skill masters are the contract's types.
- The TP-to-contract field mappings (characteristics, skill references,
  career counter names) are written once, here, so consumers pass the values
  on unchanged. A change to one of those shapes is a contract change that
  reaches this parser, `packages/import-tp-live` and `tools/import-tp`
  together.

Its only workspace dependencies are `packages/domain-enums` and
`packages/api-contract`, which is what lets it serve both sides of the
[client/server boundary](../architecture.md#clientserver-boundary).

## No BBL counterpart

There is deliberately no shared BBL parser. BBL _interpretation_ (page-type
parsing, HTML extraction) stays inside each tool that does it, so the review
tools can check the importer's reading of a page against their own. Only the
mechanical file access is shared, via
[read-bbl-mirror](../read-bbl-mirror/index.md).

## Development

```bash
pnpm --filter @blood-bowl-tracker/parse-tp run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/parse-tp run verify  # build + lint + typecheck + format + test
```
