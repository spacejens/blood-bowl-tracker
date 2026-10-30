# Official team list requests

`TpOfficialTeamsFilesImportService` does not send a rules set's official team
list in one `tpOfficialTeams.import` call. The server's cost grows with the
number of positions, and one call for a large rules set can outlive the
client's per-request timeout. Each rules set is sent as several smaller calls
instead, one after another.

## How a rules set is split

1. **Shared stars are normalized.** A star fielded by several races lands on
   one database row, and the races can list it with different values. The
   server picks one set of values per row only among the races of one call,
   so `TpOfficialStarNormalizerService` first gives every race's copy of a
   star the values of the listing the server would keep for the whole rules
   set: one listing per race name, then one across races in first-seen order,
   official beating legacy and otherwise the later listing winning. Both
   sides decide through `packages/parse-tp`'s
   `TpOfficialListingPrecedenceService`, so they cannot drift. Each copy
   keeps its own TP position id. Every chunk then writes identical star data,
   and the order of the chunks does not matter.
   The normalization covers every race in the rules set's list, including a
   race the server later fails to import, so such a race still takes part in
   choosing the winning listing.
2. **Races are packed into chunks.** `TpOfficialTeamsChunkerService` packs
   whole races, in first-seen order, into chunks of at most
   `OFFICIAL_TEAMS_POSITION_BUDGET` (40) positions. Every variant of one race
   name (official and legacy codes) stays in the same chunk, because the
   server merges a position's listings by race only within one call. A race
   name larger than the budget is sent alone.
3. **Each chunk is one call**, carrying the chunk's races and the whole
   scanned skill-name lookup. The request shape is the same as for a whole
   rules set.

## How results are merged

`TpOfficialTeamsChunkMergeService` merges the calls so the run reports as if
each rules set had been sent whole: counts are summed per stage, errors
concatenated, and characteristics collected by position and rules set id.
Within one rules set and stage, a warning several calls repeat is kept once.
That covers an exact repeat (for example a rules set declared by no era) and a
gap the server reports once per call as "first seen on position X" (an
uncurated keyword code, an unresolvable skill id), which is identified
without its position.

A call that fails outright becomes one error under races, naming the rules
set and the chunk's races, for example:

```text
Failed to import TP's official team list for rules set "BB2020", races Orc, Dwarf: The operation was aborted due to timeout
```

The other chunks still run. Every write is an upsert or an add-only sync, so
re-running the import repairs a failed chunk.

## Reading the timing summary

Every run that sends at least one call prints a timing summary of the
official team list calls as soon as that import step finishes, before the
later steps run, so a failure further on does not lose it:

```text
Official team list import timing:
  BB2020: 2 request(s), 1500 ms wall-clock
    request 1/2 (Orc, Dwarf; 38 positions): 1000 ms wall-clock; context 3 ms, races 40 ms, positions 700 ms, ...
    request 2/2 (Elf; 12 positions): 500 ms wall-clock, failed
```

- **wall-clock** is measured by the importer, from sending the call to its
  result or failure. It includes network time and any retries
  `ResilientFetchService` made.
- The **stage durations** come from the server (the result's `timings`; see
  [import-tp-live's official team list import](../import-tp-live/official-teams-import.md#stage-timings)).
  If their sum is far below the wall-clock time, look at the network or
  retries, not the database.
- **failed** means the call produced no result; its error is in the run's
  error list. **no stage timings reported** means the server answered
  without `timings`.
