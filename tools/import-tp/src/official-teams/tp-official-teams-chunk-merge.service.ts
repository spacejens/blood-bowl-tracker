import type {
  TpOfficialCharacteristics,
  TpOfficialTeamsImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/** The per-stage ImportResults of a `tpOfficialTeams.import` result. */
export type OfficialTeamsStage = Exclude<
  keyof TpOfficialTeamsImportResult,
  'positionCharacteristics' | 'timings'
>;

export const OFFICIAL_TEAMS_STAGES: readonly OfficialTeamsStage[] = [
  'races',
  'positions',
  'characteristics',
  'keywords',
  'startingSkills',
  'skillCategories',
];

/** One stage's merged count and errors. */
export interface OfficialTeamsStageTally {
  imported: number;
  errors: ImportError[];
}

/** One successful request's result, with the rules set it was for. */
export interface RulesSetChunkOutcome {
  rulesSet: string;
  outcome: TpOfficialTeamsImportResult;
}

/** Options for {@link TpOfficialTeamsChunkMergeService.merge}. */
export interface MergeOfficialTeamsChunksOptions {
  /** Every successful request's result, in the order they were sent. */
  outcomes: RulesSetChunkOutcome[];
  /** One error per request that failed outright; reported under races. */
  failureErrors: ImportError[];
}

/** Every request's results merged into one per stage. */
export interface MergedOfficialTeamsChunks {
  tallies: Record<OfficialTeamsStage, OfficialTeamsStageTally>;
  /** positionId -> rulesSetId -> characteristics. */
  characteristicsByPositionId: Map<
    number,
    Map<number, TpOfficialCharacteristics>
  >;
}

/** An error's identity for de-duplication, scoped to its rules set and stage. */
interface DedupeKeyOptions {
  rulesSet: string;
  stage: OfficialTeamsStage;
  error: ImportError;
}

/**
 * Merges the results of the several `tpOfficialTeams.import` requests one
 * rules set's official team list is split into, so the run reports as if
 * each rules set had been sent whole.
 */
@Injectable()
export class TpOfficialTeamsChunkMergeService {
  /**
   * Sums each stage's count and concatenates its errors, failed requests
   * first under races. Within one rules set and stage, an error repeated by
   * several requests is kept once: an exact repeat (same item and message),
   * or a gap the server reports once per request naming the position it was
   * "first seen on" (an item with a `position` plus a `keywordCode` or
   * `skillMasterId`), which is identified without that position. Collects
   * every position's characteristics by position and rules set id.
   */
  merge({
    outcomes,
    failureErrors,
  }: MergeOfficialTeamsChunksOptions): MergedOfficialTeamsChunks {
    const tallies: Record<OfficialTeamsStage, OfficialTeamsStageTally> = {
      races: { imported: 0, errors: [...failureErrors] },
      positions: { imported: 0, errors: [] },
      characteristics: { imported: 0, errors: [] },
      keywords: { imported: 0, errors: [] },
      startingSkills: { imported: 0, errors: [] },
      skillCategories: { imported: 0, errors: [] },
    };
    const characteristicsByPositionId = new Map<
      number,
      Map<number, TpOfficialCharacteristics>
    >();
    const seen = new Set<string>();
    for (const { rulesSet, outcome } of outcomes) {
      for (const stage of OFFICIAL_TEAMS_STAGES) {
        tallies[stage].imported += outcome[stage].imported;
        for (const error of outcome[stage].errors) {
          const key = this.dedupeKey({ rulesSet, stage, error });
          if (!seen.has(key)) {
            seen.add(key);
            tallies[stage].errors.push(error);
          }
        }
      }
      for (const {
        positionId,
        rulesSetId,
        ...characteristics
      } of outcome.positionCharacteristics) {
        let byRulesSetId = characteristicsByPositionId.get(positionId);
        if (byRulesSetId === undefined) {
          byRulesSetId = new Map();
          characteristicsByPositionId.set(positionId, byRulesSetId);
        }
        byRulesSetId.set(rulesSetId, characteristics);
      }
    }
    return { tallies, characteristicsByPositionId };
  }

  private dedupeKey({ rulesSet, stage, error }: DedupeKeyOptions): string {
    const { item, message } = error;
    if (this.isFirstSeenGap(item)) {
      const { position: _position, ...identity } = item;
      return JSON.stringify([rulesSet, stage, identity]);
    }
    return JSON.stringify([rulesSet, stage, item, message]);
  }

  /** A gap the server reports once per request, naming where it was first seen. */
  private isFirstSeenGap(
    item: unknown,
  ): item is Record<string, unknown> & { position: unknown } {
    return (
      typeof item === 'object' &&
      item !== null &&
      'position' in item &&
      ('keywordCode' in item || 'skillMasterId' in item)
    );
  }
}
