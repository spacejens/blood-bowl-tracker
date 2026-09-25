import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { TpOfficialTeamsImportResult } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ImportRunnerService,
} from '@blood-bowl-tracker/import';
import type {
  TpOfficialRace,
  TpPositionCharacteristics,
  TpSkillMaster,
} from '@blood-bowl-tracker/parse-tp';
import { Inject, Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { OfficialTeamsEntry } from '../source/official-teams-collection.service';

/** Options for {@link TpOfficialTeamsImportService.importOfficialTeams}. */
export interface ImportOfficialTeamsOptions {
  /** Every downloaded official-list race, tagged with its rules set folder. */
  officialTeams: OfficialTeamsEntry[];
  /** The skillMasterId -> name lookup scanned from the downloaded mirror. */
  skillMastersByMasterId: Map<number, TpSkillMaster>;
}

/** What importing the whole official team list did, one result per stage. */
export interface OfficialTeamsImportOutcome {
  racesResult: ImportResult;
  positionsResult: ImportResult;
  characteristicsResult: ImportResult;
  keywordsResult: ImportResult;
  startingSkillsResult: ImportResult;
  /**
   * positionId -> rulesSetId -> characteristics, for the hired-star step,
   * which uses them as a freshly hired star's template values.
   */
  characteristicsByPositionId: Map<
    number,
    Map<number, TpPositionCharacteristics>
  >;
}

type Stage = Exclude<
  keyof TpOfficialTeamsImportResult,
  'positionCharacteristics'
>;

const STAGES: readonly Stage[] = [
  'races',
  'positions',
  'characteristics',
  'keywords',
  'startingSkills',
];

interface Tally {
  imported: number;
  errors: ImportError[];
}

@Injectable()
export class TpOfficialTeamsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
    private readonly importResults: ImportResultService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Imports TP's downloaded official team list through
   * `tpOfficialTeams.import`, one call per rules set folder. Each call sends
   * that rules set's parsed races and the whole scanned skill-name lookup
   * (TP's list names skills by id only, and the scan is what lets the server
   * upsert a skill no earlier import has registered yet); the server writes
   * the races, positions, characteristics, keywords and starting skills. A
   * call that fails outright is recorded under races and the other rules
   * sets still import.
   */
  async importOfficialTeams({
    officialTeams,
    skillMastersByMasterId,
  }: ImportOfficialTeamsOptions): Promise<OfficialTeamsImportOutcome> {
    const externalSystemName = this.externalSystemName.getTpSystemName();
    const skillMasters = [...skillMastersByMasterId].map(
      ([skillMasterId, master]) => ({
        skillMasterId,
        name: master.name,
        isElite: master.isElite,
      }),
    );
    const tallies: Record<Stage, Tally> = {
      races: { imported: 0, errors: [] },
      positions: { imported: 0, errors: [] },
      characteristics: { imported: 0, errors: [] },
      keywords: { imported: 0, errors: [] },
      startingSkills: { imported: 0, errors: [] },
    };
    const characteristicsByPositionId = new Map<
      number,
      Map<number, TpPositionCharacteristics>
    >();

    for (const [rulesSet, races] of this.racesByRulesSet(officialTeams)) {
      const outcome = await this.importRunner.recordUpsertResult({
        upsert: () =>
          this.client.tpOfficialTeams.import({
            rulesSet,
            races,
            skillMasters,
            externalSystemName,
          }),
        item: { rulesSet },
        errors: tallies.races.errors,
        buildErrorMessage: (err) =>
          `Failed to import TP's official team list for rules set "${rulesSet}": ${err instanceof Error ? err.message : String(err)}`,
      });
      if (outcome === undefined) {
        continue;
      }
      for (const stage of STAGES) {
        tallies[stage].imported += outcome[stage].imported;
        tallies[stage].errors.push(...outcome[stage].errors);
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

    return {
      racesResult: this.importResults.result(tallies.races),
      positionsResult: this.importResults.result(tallies.positions),
      characteristicsResult: this.importResults.result(tallies.characteristics),
      keywordsResult: this.importResults.result(tallies.keywords),
      startingSkillsResult: this.importResults.result(tallies.startingSkills),
      characteristicsByPositionId,
    };
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
