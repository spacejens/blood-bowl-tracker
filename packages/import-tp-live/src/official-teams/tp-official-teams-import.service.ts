import type {
  ImportError,
  TpOfficialTeamsImportResult,
  TpSkillMasterName,
} from '@blood-bowl-tracker/api-contract';
import type { TpOfficialRace } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpOfficialCharacteristicsSyncService } from './tp-official-characteristics-sync.service';
import { TpOfficialKeywordCatalogService } from './tp-official-keyword-catalog.service';
import { TpOfficialKeywordsSyncService } from './tp-official-keywords-sync.service';
import { TpOfficialPositionsUpsertService } from './tp-official-positions-upsert.service';
import { TpOfficialRacesUpsertService } from './tp-official-races-upsert.service';
import { TpOfficialSkillRefsService } from './tp-official-skill-refs.service';
import { TpOfficialStartingSkillsService } from './tp-official-starting-skills.service';
import { TpOfficialTeamsContextService } from './tp-official-teams-context.service';

/** Options for {@link TpOfficialTeamsImportService.importOfficialTeams}. */
export interface ImportOfficialTeamsOptions {
  /** The rules set the list is for, by name (its TP external id). */
  rulesSet: string;
  /** Every official and legacy race TP lists for that rules set, parsed. */
  races: TpOfficialRace[];
  /**
   * Names for referenced skillMasterIds, when the caller has them; an id
   * with no name resolves only through a skill already registered under it.
   */
  skillMasters?: TpSkillMasterName[];
  /** The name TP's external system is registered under. */
  externalSystemName: string;
}

/**
 * Imports one rules set's TP official team list straight into the database:
 * the shared core of the live official-teams import and the
 * `tpOfficialTeams.import` procedure tools/import-tp's bulk run calls once
 * per rules set.
 */
@Injectable()
export class TpOfficialTeamsImportService {
  constructor(
    private readonly context: TpOfficialTeamsContextService,
    private readonly racesUpsert: TpOfficialRacesUpsertService,
    private readonly positionsUpsert: TpOfficialPositionsUpsertService,
    private readonly characteristicsSync: TpOfficialCharacteristicsSyncService,
    private readonly keywordCatalog: TpOfficialKeywordCatalogService,
    private readonly keywordsSync: TpOfficialKeywordsSyncService,
    private readonly skillRefs: TpOfficialSkillRefsService,
    private readonly startingSkills: TpOfficialStartingSkillsService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * Resolves the rules set's context, then upserts its races, its positions
   * (regular and star) with their race/era availability, their
   * characteristics, and -- only after characteristics, since the server
   * rejects a keyword or starting skill for a position with no
   * characteristics row -- their keywords and starting skills. Each stage's
   * failures are reported in that stage's result and never stop the stages
   * after it; nothing is imported when the context cannot be resolved (its
   * failure is reported under `races`).
   */
  async importOfficialTeams({
    rulesSet,
    races,
    skillMasters = [],
    externalSystemName,
  }: ImportOfficialTeamsOptions): Promise<TpOfficialTeamsImportResult> {
    const raceErrors: ImportError[] = [];
    const context = await this.context.resolve({
      rulesSet,
      externalSystemName,
      errors: raceErrors,
    });
    if (context === undefined) {
      return this.notImported(raceErrors);
    }
    const upsertedRaces = await this.racesUpsert.upsertRaces({
      races,
      context,
      errors: raceErrors,
    });

    const positionErrors: ImportError[] = [];
    const positions = await this.positionsUpsert.upsertPositions({
      races,
      racesByCode: upsertedRaces.racesByCode,
      context,
      errors: positionErrors,
    });
    const { slots } = positions;

    const characteristicErrors: ImportError[] = [];
    const characteristics = await this.characteristicsSync.syncCharacteristics({
      slots,
      context,
      errors: characteristicErrors,
    });

    const keywordErrors: ImportError[] = [];
    const catalog = await this.keywordCatalog.load({
      tpSystemId: context.tpSystemId,
      errors: keywordErrors,
    });
    const keywordsImported = await this.keywordsSync.syncKeywords({
      slots,
      catalog,
      context,
      errors: keywordErrors,
    });

    const skillErrors: ImportError[] = [];
    const refsByPositionId = await this.skillRefs.resolve({
      slots,
      skillMasters,
      catalog,
      context,
      errors: skillErrors,
    });
    const skillsImported = await this.startingSkills.syncStartingSkills({
      refsByPositionId,
      context,
      errors: skillErrors,
    });

    return {
      races: this.importResults.result({
        imported: upsertedRaces.imported,
        errors: raceErrors,
      }),
      positions: this.importResults.result({
        imported: positions.imported,
        errors: positionErrors,
      }),
      characteristics: this.importResults.result({
        imported: characteristics.imported,
        errors: characteristicErrors,
      }),
      keywords: this.importResults.result({
        imported: keywordsImported,
        errors: keywordErrors,
      }),
      startingSkills: this.importResults.result({
        imported: skillsImported,
        errors: skillErrors,
      }),
      positionCharacteristics: characteristics.positionCharacteristics,
    };
  }

  private notImported(raceErrors: ImportError[]): TpOfficialTeamsImportResult {
    const nothing = () =>
      this.importResults.result({ imported: 0, errors: [] });
    return {
      races: this.importResults.result({ imported: 0, errors: raceErrors }),
      positions: nothing(),
      characteristics: nothing(),
      keywords: nothing(),
      startingSkills: nothing(),
      positionCharacteristics: [],
    };
  }
}
