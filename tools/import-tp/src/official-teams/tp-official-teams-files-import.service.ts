import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  TpOfficialCharacteristics,
  TpOfficialRace,
  TpSkillMasterName,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ImportRunnerService,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/import';
import type { TpSkillMaster } from '@blood-bowl-tracker/parse-tp';
import { Inject, Injectable } from '@nestjs/common';

import type { OfficialTeamsEntry } from '../source/official-teams-collection.service';
import { MonotonicClockService } from './monotonic-clock.service';
import { TpOfficialStarNormalizerService } from './tp-official-star-normalizer.service';
import type { RulesSetChunkOutcome } from './tp-official-teams-chunk-merge.service';
import { TpOfficialTeamsChunkMergeService } from './tp-official-teams-chunk-merge.service';
import {
  OFFICIAL_TEAMS_POSITION_BUDGET,
  TpOfficialTeamsChunkerService,
} from './tp-official-teams-chunker.service';
import type { OfficialTeamsRequestTiming } from './tp-official-teams-timing-report.service';

/** Options for {@link TpOfficialTeamsFilesImportService.importOfficialTeams}. */
export interface ImportOfficialTeamsFilesOptions {
  /** Every downloaded official-list race, tagged with its rules set folder. */
  officialTeams: OfficialTeamsEntry[];
  /** The skillMasterId -> name lookup scanned from the downloaded mirror. */
  skillMastersByMasterId: Map<number, TpSkillMaster>;
}

/** What importing the whole official team list did, one result per stage. */
export interface OfficialTeamsFilesImportOutcome {
  racesResult: ImportResult;
  positionsResult: ImportResult;
  characteristicsResult: ImportResult;
  keywordsResult: ImportResult;
  startingSkillsResult: ImportResult;
  skillCategoriesResult: ImportResult;
  /**
   * positionId -> rulesSetId -> characteristics, for the hired-star step,
   * which uses them as a freshly hired star's template values.
   */
  characteristicsByPositionId: Map<
    number,
    Map<number, TpOfficialCharacteristics>
  >;
  /** How long each request took, in the order they were sent. */
  requestTimings: OfficialTeamsRequestTiming[];
}

/** One chunk to send, and where its result or failure goes. */
interface ImportChunkOptions {
  rulesSet: string;
  races: TpOfficialRace[];
  skillMasters: TpSkillMasterName[];
  outcomes: RulesSetChunkOutcome[];
  failureErrors: ImportError[];
}

@Injectable()
export class TpOfficialTeamsFilesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
    private readonly importResults: ImportResultService,
    private readonly starNormalizer: TpOfficialStarNormalizerService,
    private readonly chunker: TpOfficialTeamsChunkerService,
    private readonly chunkMerge: TpOfficialTeamsChunkMergeService,
    private readonly clock: MonotonicClockService,
  ) {}

  /**
   * Imports TP's downloaded official team list through
   * `tpOfficialTeams.import`. Each rules set folder's races have their shared
   * stars normalized, then are split into chunks of whole races (every
   * variant of a race name together) within OFFICIAL_TEAMS_POSITION_BUDGET
   * positions, and each chunk is sent, one after another, as its own
   * request with the whole scanned skill-name lookup (TP's list names
   * skills by id only, and the scan is what lets the server upsert a skill
   * no earlier import has registered yet). The server writes the races,
   * positions, characteristics, keywords, starting skills and skill
   * categories. A request that fails outright, including an unexpected
   * database error on the server, is recorded under races, naming its rules
   * set and races, and the other requests still run. The results are merged
   * as if each rules set had been sent whole, and every request's timing is
   * returned for the run's summary.
   */
  async importOfficialTeams({
    officialTeams,
    skillMastersByMasterId,
  }: ImportOfficialTeamsFilesOptions): Promise<OfficialTeamsFilesImportOutcome> {
    const skillMasters = [...skillMastersByMasterId].map(
      ([skillMasterId, master]) => ({
        skillMasterId,
        name: master.name,
        isElite: master.isElite,
      }),
    );
    const outcomes: RulesSetChunkOutcome[] = [];
    const failureErrors: ImportError[] = [];
    const requestTimings: OfficialTeamsRequestTiming[] = [];

    for (const [rulesSet, races] of this.racesByRulesSet(officialTeams)) {
      const chunks = this.chunker.chunk({
        races: this.starNormalizer.normalize(races),
        positionBudget: OFFICIAL_TEAMS_POSITION_BUDGET,
      });
      for (const chunk of chunks) {
        requestTimings.push(
          await this.importChunk({
            rulesSet,
            races: chunk,
            skillMasters,
            outcomes,
            failureErrors,
          }),
        );
      }
    }

    const { tallies, characteristicsByPositionId } = this.chunkMerge.merge({
      outcomes,
      failureErrors,
    });
    return {
      racesResult: this.importResults.result(tallies.races),
      positionsResult: this.importResults.result(tallies.positions),
      characteristicsResult: this.importResults.result(tallies.characteristics),
      keywordsResult: this.importResults.result(tallies.keywords),
      startingSkillsResult: this.importResults.result(tallies.startingSkills),
      skillCategoriesResult: this.importResults.result(tallies.skillCategories),
      characteristicsByPositionId,
      requestTimings,
    };
  }

  /**
   * Sends one chunk, adding its result to `outcomes` or its failure to
   * `failureErrors`, and returns how long it took.
   */
  private async importChunk({
    rulesSet,
    races,
    skillMasters,
    outcomes,
    failureErrors,
  }: ImportChunkOptions): Promise<OfficialTeamsRequestTiming> {
    const raceNames = [...new Set(races.map((race) => race.name))];
    const positions = races.reduce(
      (sum, race) => sum + race.positions.length,
      0,
    );
    const started = this.clock.nowMs();
    const outcome = await this.importRunner.recordUpsertResult({
      upsert: () =>
        this.client.tpOfficialTeams.import({
          rulesSet,
          races,
          skillMasters,
          externalSystemName: TP_EXTERNAL_SYSTEM_NAME,
        }),
      item: { rulesSet, races: raceNames },
      errors: failureErrors,
      buildErrorMessage: (err) =>
        `Failed to import TP's official team list for rules set "${rulesSet}", races ${raceNames.join(', ')}: ${err instanceof Error ? err.message : String(err)}`,
    });
    const timing = {
      rulesSet,
      races: raceNames,
      positions,
      wallMs: this.clock.nowMs() - started,
    };
    if (outcome === undefined) {
      return timing;
    }
    outcomes.push({ rulesSet, outcome });
    return { ...timing, stages: outcome.timings ?? [] };
  }

  /** Each rules set folder's races, in first-seen order. */
  private racesByRulesSet(
    officialTeams: OfficialTeamsEntry[],
  ): Map<string, TpOfficialRace[]> {
    const byRulesSet = new Map<string, TpOfficialRace[]>();
    for (const { race, rulesSet } of officialTeams) {
      const races = byRulesSet.get(rulesSet) ?? [];
      races.push(race);
      byRulesSet.set(rulesSet, races);
    }
    return byRulesSet;
  }
}
