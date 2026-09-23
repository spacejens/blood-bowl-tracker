import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  RacesImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { Inject, Injectable } from '@nestjs/common';

import type { TpExternalSystemNameProvider } from '../tp-import-providers';
import { TP_EXTERNAL_SYSTEM_NAME_PROVIDER } from '../tp-import-providers';

/** Options for {@link TpEraResolutionService.resolveEra}. */
export interface ResolveEraOptions {
  roster: TpRoster;
  /** The era the caller names explicitly; auto-resolved when omitted. */
  era?: string;
  /** Where a resolution failure is recorded. */
  errors: ImportError[];
}

@Injectable()
export class TpEraResolutionService {
  constructor(
    @Inject(TP_EXTERNAL_SYSTEM_NAME_PROVIDER)
    private readonly externalSystemName: TpExternalSystemNameProvider,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly lookup: ReferenceLookupService,
    private readonly racesImport: RacesImportService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * The era name to import `roster` under. TP's roster carries no era, so an
   * explicitly given era is used as-is; otherwise the team's race is resolved
   * by its TP race code and its one ongoing era (no end date) is used. No
   * ongoing era, or several — a Dungeon Bowl era commonly runs alongside a
   * normal one — cannot be decided here, so each records one ImportError and
   * yields undefined, as does a race that cannot be resolved. The returned
   * name is the era's TP external id, which is its name.
   */
  async resolveEra({
    roster,
    era,
    errors,
  }: ResolveEraOptions): Promise<string | undefined> {
    if (era !== undefined) {
      return era;
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      {
        name: this.externalSystemName.getTpSystemName(),
        category: 'imported_data_source',
      },
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return undefined;
    }
    const [tpSystemId] = bootstrap.ids;

    const raceRef = {
      externalSystemId: tpSystemId,
      externalId: roster.teamRaceCode,
    };
    const raceIds = await this.lookup.lookupMap('race', [raceRef]);
    const raceId = raceIds.get(this.lookup.keyOf(raceRef));
    if (raceId === undefined) {
      errors.push(
        this.importResults.error({
          item: { team: roster.id, teamRaceCode: roster.teamRaceCode },
          message: `Could not resolve an era for team "${roster.teamName}": could not resolve race for code "${roster.teamRaceCode}"`,
        }),
      );
      return undefined;
    }

    const ongoing = await this.racesImport.listOngoingEras(raceId, errors);
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
