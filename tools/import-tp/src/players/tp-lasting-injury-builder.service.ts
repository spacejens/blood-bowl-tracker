import type {
  CharacteristicFormat,
  PlayerLastingInjuries,
  RulesSet,
} from '@blood-bowl-tracker/api-contract';
import type {
  TpPlayerCharacteristics,
  TpRosterPlayer,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

/** The lasting-injury subset of an `UpsertPlayer` payload. */
export type TpLastingInjuriesPayload = PlayerLastingInjuries;

/**
 * The five reduction counters, excluding the boolean `missNextGame` and the
 * directly-reported `nigglingInjuryCount` — a reduction gap must never be
 * assignable to the field TP itself reports outright.
 */
type ReductionCounter = Exclude<
  keyof PlayerLastingInjuries,
  'missNextGame' | 'nigglingInjuryCount'
>;

/** One characteristic, paired with the counter its reduction feeds. */
interface Comparison {
  key: keyof TpPlayerCharacteristics;
  counter: ReductionCounter;
  format: CharacteristicFormat;
  /**
   * Whether a LOWER stored number is the better one for the player. True only
   * for Agility and Passing under a target-number format: those are targets
   * the PLAYER rolls, so a smaller target is easier to make. Armour under the
   * same format is the opposite — it is a target the OPPONENT rolls to hurt
   * the player, so a bigger number protects them better — and every
   * characteristic under `bare` is a plain "more is better" number.
   */
  lowerIsBetter: boolean;
}

/**
 * Derives a TP player's currently outstanding lasting injuries.
 *
 * TP reports two of the three kinds outright: `nigglingInjuries` is a count,
 * and `canPlayNextGame: false` is its spelling of miss-next-game. It has no
 * equivalent flag for "this characteristic is currently reduced" at all — so
 * that third kind is derived by diffing the player's own current
 * characteristics against the position template they were recruited from.
 *
 * The diff is sound because advancement only ever moves a stat toward better,
 * never worse: any current value on the WORSE side of the template is
 * therefore an active, unhealed reduction, and the gap's magnitude is how many
 * reductions deep it is. Direction is per characteristic per rules set, which
 * is why the rules set's declared `CharacteristicFormat`s are an input rather
 * than an assumption — and why one player can show an advancement and an
 * injury at the same time (a real example in the mirror has `ma` one better
 * than template and `av` one worse) without either masking the other.
 *
 * Pure and dependency-free: no I/O, no collaborators, no state.
 */
@Injectable()
export class TpLastingInjuryBuilderService {
  /**
   * Returns `undefined` when the entry carried no live lasting-injury state at
   * all — a match-embedded roster snapshot, which has none of these fields. An
   * omitted group leaves whatever is already stored untouched, which is right:
   * overwriting real state with zeroes inferred from an absence would be worse
   * than saying nothing.
   *
   * When the live state IS present but no baseline can be established (no
   * template — a mercenary hire has no catalog entry — or no resolved rules
   * set to say which direction is worse), the two directly-reported kinds are
   * still sent and every reduction count is 0. That is honest: those two are
   * facts TP stated, and a reduction this importer cannot see is not a
   * reduction it should invent.
   */
  forRosterPlayer(options: {
    player: TpRosterPlayer;
    rulesSet: RulesSet | undefined;
  }): TpLastingInjuriesPayload | undefined {
    const { player, rulesSet } = options;
    const live = player.lastingInjuries;
    if (live === undefined) {
      return undefined;
    }

    const injuries: TpLastingInjuriesPayload = {
      missNextGame: !live.canPlayNextGame,
      nigglingInjuryCount: live.nigglingInjuries,
      moveReductionCount: 0,
      strengthReductionCount: 0,
      agilityReductionCount: 0,
      passingReductionCount: 0,
      armourReductionCount: 0,
    };

    const current = player.characteristics;
    const template = player.positionTemplate;
    if (
      current === undefined ||
      template === undefined ||
      rulesSet === undefined
    ) {
      return injuries;
    }

    for (const comparison of this.comparisons(rulesSet)) {
      if (comparison.format === 'absent') {
        continue;
      }
      const gap = comparison.lowerIsBetter
        ? current[comparison.key] - template[comparison.key]
        : template[comparison.key] - current[comparison.key];
      // Floored at 0: a value on the BETTER side of the template is an
      // advancement, not a negative injury.
      if (gap > 0) {
        injuries[comparison.counter] = gap;
      }
    }

    return injuries;
  }

  /** The five characteristics, each with this rules set's reading of it. */
  private comparisons(rulesSet: RulesSet): Comparison[] {
    const rollTarget = (format: CharacteristicFormat): boolean =>
      format === 'plus' || format === 'plus_zero_legal';
    return [
      {
        key: 'move',
        counter: 'moveReductionCount',
        format: rulesSet.moveFormat,
        lowerIsBetter: false,
      },
      {
        key: 'strength',
        counter: 'strengthReductionCount',
        format: rulesSet.strengthFormat,
        lowerIsBetter: false,
      },
      {
        key: 'agility',
        counter: 'agilityReductionCount',
        format: rulesSet.agilityFormat,
        lowerIsBetter: rollTarget(rulesSet.agilityFormat),
      },
      {
        key: 'passing',
        counter: 'passingReductionCount',
        format: rulesSet.passingFormat,
        lowerIsBetter: rollTarget(rulesSet.passingFormat),
      },
      {
        key: 'armour',
        counter: 'armourReductionCount',
        format: rulesSet.armourFormat,
        lowerIsBetter: false,
      },
    ];
  }
}
