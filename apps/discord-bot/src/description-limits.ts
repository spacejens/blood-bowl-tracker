/**
 * Discord's hard cap on one embed's `description` field; exceeding it rejects
 * the whole interaction, not just the field. Shared across `deepdive/` and
 * `insights/` fact services. Row caps (where a service has one) bound how
 * many entries are *fetched*, but names and other user-imported data have no
 * length ceiling tight enough to guarantee a row cap always fits within this
 * character cap — a handful of long names can still overflow it. Consumers
 * enforce this length limit on top of any row cap, trimming further when
 * needed, in one of two ways: by selecting which individual rows to keep,
 * each tied to a per-row drill-down entry (the player deepdive's honors and
 * kills builders — see `PlayerKillsSectionService`), or by truncating the
 * assembled text outright (e.g. `StarPlayerDeepdiveService.enforceDescriptionLimit`,
 * `PlayerDeepdiveService`'s own final safety net on top of its row
 * selection, and `DeploymentInfoService`, whose commit message is free-form
 * text with no row cap of its own). For the list-style insights facts — star players, eras,
 * trophies and competition groups, which have no row cap at all and rely on
 * this entirely — that truncation is centralised in `ListDescriptionService`
 * (`shared/`); the deepdive fact services keep their own equivalent.
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
