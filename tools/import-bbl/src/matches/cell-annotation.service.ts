import type {
  ConsequenceAvoidedBy,
  UnidentifiedParticipantKind,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/**
 * What one `<br>`-delimited, link-less segment of a BBL match-event cell
 * means. `ignored` is a known note that is deliberately not an occurrence and
 * deliberately not an error; `unrecognised` is text outside the vocabulary,
 * which the caller reports as a non-fatal import error rather than guessing.
 */
export type CellAnnotation =
  | { kind: 'unidentified'; participant: UnidentifiedParticipantKind }
  | { kind: 'avoided'; avoidedBy: ConsequenceAvoidedBy }
  | { kind: 'foul' }
  | { kind: 'ignored' }
  | { kind: 'unrecognised' };

/**
 * A participant BBL names as plain text instead of a player link. Derived
 * from a survey of all 2405 mirrored match-detail pages, where these five
 * texts are the complete set. `Map` rather than an object literal so an
 * inherited `Object.prototype` key (e.g. "constructor") can never be
 * mistaken for a vocabulary entry.
 */
const UNIDENTIFIED_PARTICIPANTS = new Map<string, UnidentifiedParticipantKind>([
  ['fans / random event', 'fans_or_random_event'],
  ['mercenary / fans / random event', 'mercenary_or_fans_or_random_event'],
  ['mercenary / star', 'mercenary_or_star'],
  ['journeyman', 'journeyman'],
  ['mercenary', 'mercenary'],
]);

/** Texts stating that a casualty was prevented. Consequence rows only. */
const AVOIDED_CONSEQUENCES = new Map<string, ConsequenceAvoidedBy>([
  ['victim healed by apoth', 'apothecary'],
  ['victim regenerated', 'regeneration'],
]);

/**
 * A casualty caused by a foul whose fouler BBL cannot identify — the same
 * construct as `foul by <player link>`, minus the link. Distinct from
 * `match-events-page-parser.ts`'s `FOUL_BY_PREFIX` (that one matches the
 * linked-fouler prefix, not this bare marker) — kept as two separately-named
 * constants so an edit to one is never mistaken for an edit to the other.
 */
const BARE_FOUL = 'foul';

/**
 * Notes that appear inside an event row but describe the match, not a
 * participant. Known and deliberately dropped without an error.
 */
const IGNORED_NOTES = new Set(['extra shoot-out td after tied overtime']);

/**
 * Classifies one normalized, link-less cell segment against BBL's closed
 * annotation vocabulary. Kept separate from `MatchEventsPageParser` because
 * the vocabulary is the part most likely to change when the mirror does, and
 * it has a self-contained test surface.
 */
@Injectable()
export class CellAnnotationService {
  classify(text: string): CellAnnotation {
    const key = text.replace(/\s+/g, ' ').trim().toLowerCase();

    const participant = UNIDENTIFIED_PARTICIPANTS.get(key);
    if (participant !== undefined) {
      return { kind: 'unidentified', participant };
    }
    const avoidedBy = AVOIDED_CONSEQUENCES.get(key);
    if (avoidedBy !== undefined) {
      return { kind: 'avoided', avoidedBy };
    }
    if (key === BARE_FOUL) {
      return { kind: 'foul' };
    }
    if (IGNORED_NOTES.has(key)) {
      return { kind: 'ignored' };
    }
    return { kind: 'unrecognised' };
  }
}
