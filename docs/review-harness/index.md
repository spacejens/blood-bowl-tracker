# review-harness

`packages/review-harness` is the domain-agnostic half of the review tools —
[review-match](../review-match/index.md),
[review-player](../review-player/index.md),
[review-race](../review-race/index.md) and
[review-star-player](../review-star-player/index.md). A change here reaches
all four at once.

## What it owns

- **Review-run orchestration** (`ReviewServiceBase`) and the **report document
  shell** (`ReportBuilderBase`). Each tool's `ReviewService` and
  `ReportBuilderService` is a thin subclass supplying only what differs.
- **HTML fragment assembly** (`HtmlService`), **timestamped report writing**,
  and **JSON5 config loading** (`createReviewConfigServiceBase`, over
  [config-loader](../config-loader/index.md)).
- **The plug-in interfaces and DI wiring** each data-type module registers
  through (`DataTypeReviewer`, `Stratifier`).
- **Leaf helpers** each tool provides by plain import where it needs them:
  - `ExternalSystemLookupService` — the memoized `external_systems.id` lookup
    by each source's shared external-system name from `packages/domain-enums`.
  - `CharacteristicFormatService` with its none marker — rendering one
    characteristic for a `CharacteristicFormat`, shared by `review-player` and
    `review-race` (review-match has no characteristics to format).
  - `ManualBatchReaderService` — the mechanical reading of the hand-curated
    data batches: walking every batch directory and then every `.json5` file
    in name order, pooling each top-level array section (a missing, malformed
    or non-object file counts as empty), memoized per batches directory, plus
    the later-entry-wins `latestByKey`. Used by `review-player`, `review-race`
    and `review-star-player`. It shapes no entry: each tool still reads what a
    curated entry means itself.

## What it never owns

It deliberately carries no BBL/TP parsing or interpretation logic. Raw-source
parsing, comparison predicates and label tables stay duplicated per tool,
which is what keeps each review tool independent of importer logic: a bug in
this scaffolding cannot "agree with itself" against a raw source, because the
scaffolding never touches a source's meaning.

## Why abstract base classes

The orchestration and report shell vary per tool in _behavior_ (what a
section renders, how results are looked up), so they are abstract base
classes with template methods, unlike [import](../import/index.md)'s
config-object factories, where only data varies.

## Development

```bash
pnpm --filter @blood-bowl-tracker/review-harness run test    # unit tests with coverage
pnpm --filter @blood-bowl-tracker/review-harness run verify  # build + lint + typecheck + format + test
```
