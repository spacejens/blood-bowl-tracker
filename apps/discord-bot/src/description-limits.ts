/**
 * Discord's hard cap on one embed's `description` field. The player deepdive's
 * row caps bound how many honors and kills are *fetched*, but competition,
 * trophy, player and team names are user-imported data with no length ceiling
 * tight enough to guarantee those rows always fit — a handful of long names
 * can still overflow this limit within the row cap. The honors and kills
 * builders enforce this length limit on top of their row caps, trimming
 * further when needed.
 */
export const MAX_DESCRIPTION_LENGTH = 4096;

/**
 * Reserved out of `MAX_DESCRIPTION_LENGTH` for trailing notes that are not
 * known until after a section is built: a section's own "…and N more not
 * shown." remainder, and `EntityComponentsService`'s unrelated "…and N more
 * without a link." button-overflow note. All are short and bounded by a small
 * digit count, so one shared margin comfortably covers any of them appearing.
 */
export const OVERFLOW_NOTE_BUDGET = 80;
