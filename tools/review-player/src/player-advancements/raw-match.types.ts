import type {
  StoredIncrease,
  StoredPlayerSkill,
} from '../advancement-costs/advancement-cost-model.types';
import type { BblRawIncrease } from '../source/bbl-player-skills-cell.service';

/** What the raw source says about one stored skill or characteristic increase. */
export type RawVerdict =
  | 'yes'
  | 'yes, order unknown'
  | 'not in the raw source'
  | 'not read'
  | 'not compared';

/** Stored skills checked against the raw source. */
export interface RawSkillMatch {
  /** One verdict per stored skill given, keyed by that very object. */
  verdicts: ReadonlyMap<StoredPlayerSkill, RawVerdict>;
  /** Raw skill names nothing stored accounts for, in raw order. */
  rawOnly: readonly string[];
}

/** Stored characteristic increases checked against BBL's markers. */
export interface RawIncreaseMatch {
  /** One verdict per stored increase given, keyed by that very object. */
  verdicts: ReadonlyMap<StoredIncrease, RawVerdict>;
  /** BBL markers nothing stored accounts for, in page order. */
  rawOnly: readonly BblRawIncrease[];
}
