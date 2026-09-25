import type { ImportError } from '@blood-bowl-tracker/api-contract';
import {
  ErasService,
  ExternalSystemsService,
  RacesService,
} from '@blood-bowl-tracker/game-data';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';

/** Options for {@link TpEraResolutionService.resolveEra}. */
export interface ResolveEraOptions {
  roster: TpRoster;
  /** The era the caller names explicitly; auto-resolved when omitted. */
  era?: string;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
  /** Where a resolution failure is recorded. */
  errors: ImportError[];
}

@Injectable()
export class TpEraResolutionService {
  constructor(
    private readonly externalSystems: ExternalSystemsService,
    private readonly eras: ErasService,
    private readonly races: RacesService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * The era name to import `roster` under. TP's roster carries no era, so an
   * explicitly given era is validated (it must resolve to a real era, the
   * same way the roster import will look it up) and returned as-is;
   * otherwise the team's race is resolved by its TP race code and its one
   * ongoing era (no end date) is used. An unresolvable explicit era, no
   * ongoing era, or several — a race belongs to Dungeon Bowl or to normal
   * play, never both, so several ongoing eras for one race is a genuine
   * ambiguity, not something to guess at — cannot be decided here, so each
   * records one ImportError and yields undefined, as does a race that
   * cannot be resolved. The returned
   * name is the era's TP external id, which is its name.
   */
  async resolveEra({
    roster,
    era,
    externalSystemName,
    errors,
  }: ResolveEraOptions): Promise<string | undefined> {
    const tpSystem = await this.runner.record({
      run: () =>
        this.externalSystems.upsert({
          name: externalSystemName,
          category: 'imported_data_source',
        }),
      item: { externalSystems: [externalSystemName] },
      errors,
      buildErrorMessage: (error) => this.runner.messageOf(error),
    });
    if (tpSystem === undefined) {
      return undefined;
    }
    const tpSystemId = tpSystem.system.id;

    if (era !== undefined) {
      const resolved = await this.eras.resolve({
        externalSystemId: tpSystemId,
        externalId: era,
      });
      if (!resolved.found) {
        errors.push(
          this.importResults.error({
            item: { team: roster.id, era },
            message: `Could not resolve an era for team "${roster.teamName}": era "${era}" does not exist`,
          }),
        );
        return undefined;
      }
      return era;
    }

    const race = await this.races.resolve({
      externalSystemId: tpSystemId,
      externalId: roster.teamRaceCode,
    });
    if (!race.found) {
      errors.push(
        this.importResults.error({
          item: { team: roster.id, teamRaceCode: roster.teamRaceCode },
          message: `Could not resolve an era for team "${roster.teamName}": could not resolve race for code "${roster.teamRaceCode}"`,
        }),
      );
      return undefined;
    }

    const ongoing = await this.runner.record({
      run: () => this.races.listOngoingEras(race.id),
      item: { race: race.id, ongoingEras: 'list' },
      errors,
      buildErrorMessage: (error) =>
        `Failed to list ongoing eras for race ${race.id}: ${this.runner.messageOf(error)}`,
    });
    if (ongoing === undefined) {
      return undefined;
    }
    if (ongoing.length === 1) {
      return ongoing[0].name;
    }
    const eraNames = ongoing.map((ongoingEra) => ongoingEra.name);
    errors.push(
      this.importResults.error({
        item: {
          team: roster.id,
          teamRaceCode: roster.teamRaceCode,
          ongoingEras: eraNames,
        },
        message:
          eraNames.length === 0
            ? `Could not resolve an era for team "${roster.teamName}": race "${roster.raceName}" has no ongoing era`
            : `Could not resolve an era for team "${roster.teamName}": race "${roster.raceName}" is in several ongoing eras (${eraNames.join(', ')}); the era must be specified explicitly`,
      }),
    );
    return undefined;
  }
}
