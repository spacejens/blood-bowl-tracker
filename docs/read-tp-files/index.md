# read-tp-files

`packages/read-tp-files` is the mechanical half of reading
[download-tp](../download-tp/index.md)'s files: finding them, classifying their
names and getting JSON out of them, with no opinion on what it says.

## What it does

- Knows the layout: `<dataDir>/<era>/<competition>/*.json` and the official
  team lists under `<dataDir>/teams/<rulesSet>/*.json`. `teams` is never listed
  as an era.
- Lists eras, competitions, files, team rules sets and team files. Listings are
  sorted in code-unit order, and a missing directory lists as empty. File
  listings return only plain `.json` files.
- Classifies a filename (`TpFileNameService`) as a match, roster, tournament
  (with its slug and optional subpage), awards, inscriptions, a rosters-masters
  list, or other. `rosters_masters?ruleSet=` is never read as a roster.
- Reads one file as parsed JSON, resolving its path safely against the data
  directory: a segment that is empty, `.`, `..` or contains a path separator is
  rejected. A missing file is `null`; malformed JSON is an error naming the
  full path.

## What it deliberately does not do

It carries no [parse-tp](../parse-tp/index.md) logic, no configuration and no
interpretation of a file's contents. Which files matter and what they mean stay
with each consumer, so sharing this package shares no interpretation.

Like [read-bbl-mirror](../read-bbl-mirror/index.md), it depends on no other
workspace package.

## Development

```bash
pnpm --filter @blood-bowl-tracker/read-tp-files run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/read-tp-files run verify  # build + lint + typecheck + format + test
```
