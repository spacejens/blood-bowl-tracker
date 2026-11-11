# read-bbl-mirror

`packages/read-bbl-mirror` is the mechanical half of reading BBL's `wget`
mirror: getting text out of the mirror directory, with no opinion on what it
says. [import-bbl](../import-bbl/index.md) and every review tool
([review-match](../review-match/index.md),
[review-player](../review-player/index.md),
[review-race](../review-race/index.md),
[review-star-player](../review-star-player/index.md)) use it, so a change here
reaches all of them at once.

## What it does

- Resolves a filename safely against a caller-supplied data directory.
- Reports a missing file as `null` and a missing directory as an empty
  listing, rather than throwing.
- Decodes bytes as Windows-1252. BBL's pages declare ISO-8859-1, but their
  bytes 0x80–0x9F are Windows-1252's curly quotes, dashes and ellipsis.
- Lists plain files.

## What it deliberately does not do

It carries no BBL page-type awareness and no HTML parsing. Which files matter,
what their names mean and what their contents say stay with each consumer.
That is what keeps the review tools' independence from importer logic intact:
sharing this package shares no interpretation.

Like [config-loader](../config-loader/index.md), it depends on no other
workspace package.

## Development

```bash
pnpm --filter @blood-bowl-tracker/read-bbl-mirror run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/read-bbl-mirror run verify  # build + lint + typecheck + format + test
```
