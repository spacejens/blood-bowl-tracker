/**
 * Every kind of entity that can register or be referenced through the run's
 * ExternalIdMap. One authoritative union so a processor registering under a
 * kind and a processor resolving that kind cannot silently drift apart on a
 * typo — the compiler rejects any string outside this list.
 *
 * `sppAwardValue` is deliberately absent: SPP award values are natural-keyed
 * by (rulesSet, race, actionType) and never register an external id.
 */
export type EntityKind =
  | 'rulesSet'
  | 'league'
  | 'era'
  | 'race'
  | 'position'
  | 'coach'
  | 'team'
  | 'competitionGroup'
  | 'competition'
  | 'trophy';
