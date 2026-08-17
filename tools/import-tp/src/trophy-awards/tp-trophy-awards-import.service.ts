import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionGroupsImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  ReferenceLookupService,
  TrophiesImportService,
  TrophyAwardsImportService,
} from '@blood-bowl-tracker/import';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpAwardsReaderService } from './tp-awards-reader.service';

/** One resolved team_eras row: its DB id and the era it belongs to. */
interface TeamEra {
  id: number;
  eraId: number;
}

/** One imported competition, as TpCompetitionsImportService reports it. */
interface CompetitionEntry {
  upsert: UpsertCompetition;
  era: string;
  competition: string;
  competitionGroupId: number;
  // Whether TpCompetitionsImportService's own upsert created this competition
  // fresh rather than matching an existing curated row (see
  // TpCompetitionsImportService.importCompetitions' doc comment). When true,
  // competitionGroupId cannot be trusted as a curated classification --
  // buildContext skips the competition outright instead of resolving trophies
  // against a group id that just happens to be the schema default.
  created: boolean;
}

export interface ImportTpTrophyAwardsOptions {
  competitionsByTpId: Map<number, CompetitionEntry>;
  teamErasByRosterId: Map<number, TeamEra[]>;
}

/**
 * State for the whole run, shared across competitions: the trophy-key
 * memoization cache, the TP external system id keys resolve against, the
 * curated group names by id, the batch-resolved competition DB ids and the
 * per-key dropped-row counts.
 */
interface RunContext {
  trophyIdsByKey: Map<string, number | undefined>;
  tpSystemId: number;
  groupNamesById: Map<number, string>;
  competitionIds: Map<string, number>;
  /**
   * Count, per key already known to be unresolvable, of further award rows
   * that referenced it and were dropped without their own error (since
   * TrophiesImportService only records the resolution failure once, the first
   * time the key is seen).
   */
  droppedRowCountsByKey: Map<string, number>;
}

/** Everything one competition's award rows need, gathered once. */
interface CompetitionContext {
  competitionId: number;
  groupName: string;
  eraId: number;
  tpId: number;
  run: RunContext;
}

@Injectable()
export class TpTrophyAwardsImportService {
  constructor(
    private readonly awardsReader: TpAwardsReaderService,
    private readonly trophiesImport: TrophiesImportService,
    private readonly trophyAwardsImport: TrophyAwardsImportService,
    private readonly competitionGroupsImport: CompetitionGroupsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly importResults: ImportResultService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Record every team award TP's per-competition awards files list: the
   * 1st/2nd/3rd placements and, where a competition has them, Best Stunty and
   * Wooden Spoon. TP records no individual player awards, so every row here
   * is a team award (`playerId: null`).
   *
   * A trophy is *resolved, never created*: the upsert carries only the
   * award's lookup key as a `tourplay.net` external id, matching the curated
   * catalog seeded by tools/import-manual. TP's raw `awardType` codes are not
   * globally unique per trophy -- the same code means a different trophy in a
   * different competition group -- so the key is
   * `${disambiguator}-${groupName}`: the award's own `name` when it has one
   * ("Best Stunty"/"Wooden Spoon", which share a numeric code within a file),
   * its numeric `awardType` otherwise, joined with the competition's curated
   * group name. The group comes from the competition's own
   * `competitionGroupId` (set by tools/import-manual's before-other-importers
   * phase and returned by its upsert), mapped to a name via the group catalog
   * read once here rather than once per award.
   *
   * Resolutions are memoized per run -- successes and failures alike -- so an
   * unknown key is reported once and its further rows are summarized at the
   * end, mirroring BblTrophyAwardsImportService. Every unresolvable row
   * (unknown competition, group, trophy key or team era) is recorded as an
   * error and skipped; nothing is inferred or defaulted.
   */
  async importTrophyAwards(
    options: ImportTpTrophyAwardsOptions,
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const bootstrap = await this.externalSystemBootstrap.bootstrap(
      [
        {
          name: this.externalSystemName.getTpSystemName(),
          category: 'imported_data_source',
        },
      ],
      'Failed to upsert external system: ',
    );
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { result: this.importResults.result({ imported, errors }) };
    }
    const [tpSystemId] = bootstrap.ids;

    const groups =
      await this.competitionGroupsImport.listCompetitionGroups(errors);
    if (groups === undefined) {
      return { result: this.importResults.result({ imported, errors }) };
    }

    const awardsByDirectory =
      await this.awardsReader.getAwardsByDirectory(errors);
    // One batched lookup for the whole run, not one per competition: each
    // competition's DB id is resolved server-side by external id (its TP id,
    // stringified, under its own upsert's external system id).
    const competitionIds = await this.lookup.lookupMap(
      'competition',
      [...options.competitionsByTpId].map(([tpId, entry]) => ({
        externalSystemId: entry.upsert.externalIds[0].externalSystemId,
        externalId: String(tpId),
      })),
    );
    const run: RunContext = {
      trophyIdsByKey: new Map<string, number | undefined>(),
      tpSystemId,
      groupNamesById: new Map(groups.map((group) => [group.id, group.name])),
      competitionIds,
      droppedRowCountsByKey: new Map<string, number>(),
    };

    // Tracked so a directory whose competition never reached
    // competitionsByTpId at all (competition import itself failed, e.g. an
    // unresolvable era) is still reported below, not just one whose
    // competition exists but wasn't imported (buildContext's own check).
    const consumedDirectoryKeys = new Set<string>();

    for (const [tpId, entry] of options.competitionsByTpId) {
      const directoryKey = `${entry.era}::${entry.competition}`;
      consumedDirectoryKeys.add(directoryKey);
      const awards = awardsByDirectory.get(directoryKey);
      if (awards === undefined || awards.length === 0) {
        continue;
      }
      const context = this.buildContext({ tpId, entry, run }, errors);
      if (context === undefined) {
        continue;
      }
      for (const award of awards) {
        const awarded = await this.writeAward(
          { award, context, teamErasByRosterId: options.teamErasByRosterId },
          errors,
        );
        if (awarded) {
          imported += 1;
        }
      }
    }

    for (const [directoryKey, awards] of awardsByDirectory) {
      if (!consumedDirectoryKeys.has(directoryKey) && awards.length > 0) {
        errors.push(
          this.importResults.error({
            item: { directory: directoryKey },
            message:
              `Skipped ${awards.length} award row(s) in "${directoryKey}": ` +
              'no imported competition matches that directory.',
          }),
        );
      }
    }

    for (const [key, droppedCount] of run.droppedRowCountsByKey) {
      errors.push(
        this.importResults.error({
          item: { trophy: key },
          message:
            `Skipped ${droppedCount} further award row(s) referencing the ` +
            `"${key}" trophy key: it could not be resolved (see the earlier ` +
            'error for this key).',
        }),
      );
    }

    return { result: this.importResults.result({ imported, errors }) };
  }

  /**
   * Everything this competition's awards need, or undefined after recording
   * why they must be skipped: the competition was not imported, it was not
   * pre-seeded by curated data (so its group id cannot be trusted), or its
   * group is not in the curated catalog.
   */
  private buildContext(
    options: {
      tpId: number;
      entry: CompetitionEntry;
      run: RunContext;
    },
    errors: ImportError[],
  ): CompetitionContext | undefined {
    const { tpId, entry, run } = options;
    const competitionId = run.competitionIds.get(
      this.lookup.keyOf({
        externalSystemId: entry.upsert.externalIds[0].externalSystemId,
        externalId: String(tpId),
      }),
    );
    if (competitionId === undefined) {
      errors.push(
        this.importResults.error({
          item: { competition: tpId },
          message: `Skipping trophy awards for competition id ${tpId}: it was not imported.`,
        }),
      );
      return undefined;
    }
    // A competition TpCompetitionsImportService had to create fresh (rather
    // than matching an existing curated row) was not pre-seeded by
    // tools/import-manual's before-other-importers phase, so its
    // competitionGroupId is whatever competitions.competition_group_id's
    // schema default happens to be (see that column's comment), not a real
    // classification -- checked before groupName resolution so a freshly
    // created competition never reaches trophy resolution regardless of what
    // group id it landed on.
    if (entry.created) {
      errors.push(
        this.importResults.error({
          item: { competition: tpId },
          message:
            `Skipping trophy awards for competition id ${tpId}: it was not ` +
            'pre-seeded by curated data, so its competition group cannot be ' +
            'trusted as a real classification.',
        }),
      );
      return undefined;
    }
    const groupName = run.groupNamesById.get(entry.competitionGroupId);
    if (groupName === undefined) {
      errors.push(
        this.importResults.error({
          item: { competition: tpId },
          message:
            `Skipping trophy awards for competition id ${tpId}: its ` +
            `competition group ${entry.competitionGroupId} is not in the ` +
            'curated competition-group catalog.',
        }),
      );
      return undefined;
    }
    // UpsertCompetitionSchema.eraId is optional to support partial-upsert
    // payloads from other callers, but TpCompetitionsImportService always
    // resolves eraId before building this upsert -- skipping and recording an
    // error otherwise -- so every entry reaching this service has one. Same
    // narrowing TpTeamParticipationImportService does.
    const { eraId } = entry.upsert;
    if (eraId === undefined) {
      throw new Error(
        `Competition "${entry.upsert.name}" has no eraId; import-tp always resolves eraId before building its upsert.`,
      );
    }
    return { competitionId, groupName, eraId, tpId, run };
  }

  /**
   * Resolve one award's team era and trophy and, if both resolve, write the
   * award row. Returns whether a row was written (so the caller can count
   * it).
   */
  private async writeAward(
    options: {
      award: TpAward;
      context: CompetitionContext;
      teamErasByRosterId: Map<number, TeamEra[]>;
    },
    errors: ImportError[],
  ): Promise<boolean> {
    const { award, context } = options;
    // Deliberately `||`, not `??`: TpAward.name is z.string().optional(),
    // which technically admits an empty string, and only its falsiness
    // (absent or empty) should fall back to the numeric awardType --
    // `'' ?? award.awardType` would keep the empty string and produce a
    // malformed key.
    const key = `${award.name || award.awardType}-${context.groupName}`;

    // A roster id can span more than one era, so the era is what picks the
    // right team_eras row -- the same array scan
    // TpTeamParticipationImportService and TpMatchEventKindBuildersService
    // each do for their own step.
    const teamEraId = options.teamErasByRosterId
      .get(award.rosterId)
      ?.find((teamEra) => teamEra.eraId === context.eraId)?.id;
    if (teamEraId === undefined) {
      errors.push(
        this.importResults.error({
          item: { competition: context.tpId, trophy: key },
          message:
            `Skipping the "${key}" award in competition ${context.tpId}: ` +
            `could not resolve roster ${award.rosterId} to a team era in ` +
            `era ${context.eraId}.`,
        }),
      );
      return false;
    }

    const trophyId = await this.resolveTrophyId(key, context, errors);
    if (trophyId === undefined) {
      return false;
    }
    const awarded = await this.trophyAwardsImport.upsertTrophyAward(
      {
        trophyId,
        competitionId: context.competitionId,
        teamEraId,
        playerId: null,
      },
      errors,
    );
    return Boolean(awarded);
  }

  /**
   * The catalog trophy whose TP external id is this exact key, or `undefined`
   * when it cannot be resolved (TrophiesImportService has already recorded
   * the failure on `errors`). Memoized per run, failures included; every row
   * after the first that hits an already-known-bad key is counted in
   * `droppedRowCountsByKey` instead of reported individually, so the caller
   * can add one summary error per key when the run ends.
   */
  private async resolveTrophyId(
    key: string,
    context: CompetitionContext,
    errors: ImportError[],
  ): Promise<number | undefined> {
    const { run } = context;
    if (run.trophyIdsByKey.has(key)) {
      const trophyId = run.trophyIdsByKey.get(key);
      if (trophyId === undefined) {
        run.droppedRowCountsByKey.set(
          key,
          (run.droppedRowCountsByKey.get(key) ?? 0) + 1,
        );
      }
      return trophyId;
    }
    const trophy = await this.trophiesImport.upsertTrophy(
      { externalIds: [{ externalSystemId: run.tpSystemId, externalId: key }] },
      errors,
    );
    const trophyId = trophy?.id;
    run.trophyIdsByKey.set(key, trophyId);
    return trophyId;
  }
}
