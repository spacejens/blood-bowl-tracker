/**
 * Every kind of entity that can be referenced by external id and resolved
 * server-side. One authoritative union, so a caller naming a kind and the
 * resolver dispatching on it cannot silently drift apart on a typo — the
 * compiler rejects any string outside this list.
 *
 * This mirrors exactly the set of contract namespaces that expose
 * `resolve`/`resolveBatch` (see docs/api/rpc-conventions.md). Matches, match
 * events, trophies, trophy awards and SPP award values are deliberately
 * absent: nothing references them by external id across files, phases or
 * tools.
 *
 * Players are on the list because one thing does: tools/import-manual's
 * curated `after-other-importers/trophy-awards.json5` names the winner of a
 * `manual`-kind trophy by the player's external id, which the BBL/TP
 * importers created in an earlier phase.
 */
export const RESOLVABLE_ENTITY_KINDS = [
  'coach',
  'competition',
  'competitionGroup',
  'era',
  'league',
  'player',
  'position',
  'race',
  'rulesSet',
  'team',
] as const;

export type ResolvableEntityKind = (typeof RESOLVABLE_ENTITY_KINDS)[number];
