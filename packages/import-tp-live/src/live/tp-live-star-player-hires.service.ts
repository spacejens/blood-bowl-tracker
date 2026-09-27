import type {
  ExternalId,
  ImportError,
  ImportResult,
  TeamEra,
} from '@blood-bowl-tracker/api-contract';
import { NAME_EXTERNAL_SYSTEM } from '@blood-bowl-tracker/domain-enums';
import {
  ExternalSystemsService,
  PlayersService,
  PositionRulesSetsService,
  PositionsService,
} from '@blood-bowl-tracker/game-data';
import type {
  TpInducedStarPlayer,
  TpMatch,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpNameExternalIdService } from '../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';

/** Options for {@link TpLiveStarPlayerHiresService.importHires}. */
export interface ImportStarPlayerHiresOptions {
  match: TpMatch;
  /** The home team's imported team era; undefined when it has none. */
  homeTeamEra: TeamEra | undefined;
  /** The away team's imported team era; undefined when it has none. */
  awayTeamEra: TeamEra | undefined;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
}

/** One star player hired by one roster in the match. */
interface StarPlayerHire {
  rosterId: number;
  /** The hiring side's team era; undefined when it cannot be resolved. */
  teamEra: TeamEra | undefined;
  starPlayer: TpInducedStarPlayer;
}

interface SystemIds {
  tpSystemId: number;
  nameSystemId: number;
}

/** Options for {@link TpLiveStarPlayerHiresService.importHire}. */
interface ImportHireOptions {
  hire: StarPlayerHire;
  systemIds: SystemIds;
  errors: ImportError[];
}

/**
 * Imports the star players a live-imported match's teams hired through an
 * `inducements_roll` event. A hired star is on no roster, so the match's
 * own events are the only place the hire shows up. Each hire upserts the
 * star's position (keyed exactly like the official team list import keys a
 * star: its bare name as a TP id plus its Name id, so both land on one row)
 * and a player in the hiring team's era, keyed by TP
 * `star-<rosterId>-<lineUpMasterId>` like tools/import-tp's bulk import, so
 * either path re-importing the same hire updates one row. A freshly hired
 * star has no stat line of its own, so the position's catalog baseline for
 * the hiring era is used. Every failure is one ImportError for that hire;
 * the other hires are still imported.
 */
@Injectable()
export class TpLiveStarPlayerHiresService {
  constructor(
    private readonly externalSystems: ExternalSystemsService,
    private readonly positions: PositionsService,
    private readonly positionRulesSets: PositionRulesSetsService,
    private readonly players: PlayersService,
    private readonly nameExternalId: TpNameExternalIdService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Imports every distinct `(rosterId, lineUpMasterId)` hire in the match.
   * A match hiring no star touches nothing, not even the external systems.
   * `imported` counts the hired players upserted.
   */
  async importHires(
    options: ImportStarPlayerHiresOptions,
  ): Promise<ImportResult> {
    const errors: ImportError[] = [];
    const hires = this.collectHires(options);
    if (hires.length === 0) {
      return this.importResults.result({ imported: 0, errors });
    }
    const systemIds = await this.resolveSystemIds(
      options.externalSystemName,
      errors,
    );
    if (systemIds === undefined) {
      return this.importResults.result({ imported: 0, errors });
    }
    let imported = 0;
    for (const hire of hires) {
      if (await this.importHire({ hire, systemIds, errors })) {
        imported += 1;
      }
    }
    return this.importResults.result({ imported, errors });
  }

  /** Every distinct hire, in event order, deduplicated by roster and master id. */
  private collectHires(
    options: ImportStarPlayerHiresOptions,
  ): StarPlayerHire[] {
    const hires = new Map<string, StarPlayerHire>();
    for (const event of options.match.matchEvents) {
      if (event.type !== 'inducements_roll') {
        continue;
      }
      const teamEra = this.teamEraFor(event.rosterId, options);
      for (const starPlayer of event.starPlayers) {
        const key = `${event.rosterId}:${starPlayer.lineUpMasterId}`;
        if (!hires.has(key)) {
          hires.set(key, { rosterId: event.rosterId, teamEra, starPlayer });
        }
      }
    }
    return [...hires.values()];
  }

  /** The hiring side's team era, by whichever side's TP roster id matches. */
  private teamEraFor(
    rosterId: number,
    { match, homeTeamEra, awayTeamEra }: ImportStarPlayerHiresOptions,
  ): TeamEra | undefined {
    if (rosterId === match.homeTeamTpId) {
      return homeTeamEra;
    }
    if (rosterId === match.awayTeamTpId) {
      return awayTeamEra;
    }
    return undefined;
  }

  private resolveSystemIds(
    externalSystemName: string,
    errors: ImportError[],
  ): Promise<SystemIds | undefined> {
    return this.runner.record({
      run: async () => {
        const tp = await this.externalSystems.upsert({
          name: externalSystemName,
          category: 'imported_data_source',
        });
        const name = await this.externalSystems.upsert(NAME_EXTERNAL_SYSTEM);
        return { tpSystemId: tp.system.id, nameSystemId: name.system.id };
      },
      item: {
        externalSystems: [externalSystemName, NAME_EXTERNAL_SYSTEM.name],
      },
      errors,
      buildErrorMessage: (error) => this.runner.messageOf(error),
    });
  }

  /** Imports one hire; true when its player was upserted. */
  private async importHire({
    hire,
    systemIds,
    errors,
  }: ImportHireOptions): Promise<boolean> {
    const { rosterId, teamEra, starPlayer } = hire;
    const { name, lineUpMasterId } = starPlayer;
    const item = { rosterId, lineUpMasterId, starPlayer: name };
    if (teamEra === undefined) {
      errors.push(
        this.importResults.error({
          item,
          message: `Skipped hired star player "${name}" (roster ${rosterId}): could not resolve the hiring team era`,
        }),
      );
      return false;
    }

    const upserted = await this.runner.record({
      run: () =>
        this.positions.upsert({
          name,
          isStarPlayer: true,
          externalIds: this.positionExternalIds(name, systemIds),
        }),
      item,
      errors,
      buildErrorMessage: (error) =>
        `Failed to upsert star player position "${name}": ${this.runner.messageOf(error)}`,
    });
    if (upserted === undefined) {
      return false;
    }
    const positionId = upserted.position.id;

    // Wrapped so a lookup that found nothing is told apart from one that threw.
    const lookup = await this.runner.record({
      run: async () => ({
        context: await this.positionRulesSets.findCharacteristicsContext(
          positionId,
          teamEra.eraId,
        ),
      }),
      item,
      errors,
      buildErrorMessage: (error) =>
        `Failed to look up the characteristics of star player position "${name}" (position ${positionId}, era ${teamEra.eraId}): ${this.runner.messageOf(error)}`,
    });
    if (lookup === undefined) {
      return false;
    }
    const { context } = lookup;
    const baseline = context?.baseline;
    if (context === undefined || baseline === undefined) {
      errors.push(
        this.importResults.error({
          item,
          message: `Skipped hired star player "${name}" (roster ${rosterId}): position ${positionId} has no catalog characteristics in era ${teamEra.eraId}; import the official team list first`,
        }),
      );
      return false;
    }
    const { rulesSetId } = context;

    const player = await this.runner.record({
      run: () =>
        this.players.upsert({
          name,
          teamEraId: teamEra.id,
          positionId,
          ...baseline,
          rulesSetId,
          externalIds: [
            {
              externalSystemId: systemIds.tpSystemId,
              externalId: `star-${rosterId}-${lineUpMasterId}`,
            },
          ],
        }),
      item,
      errors,
      buildErrorMessage: (error) =>
        `Failed to upsert hired star player "${name}" (roster ${rosterId}): ${this.runner.messageOf(error)}`,
    });
    return player !== undefined;
  }

  /** A star's bare name as its TP id, plus its Name id. */
  private positionExternalIds(
    name: string,
    { tpSystemId, nameSystemId }: SystemIds,
  ): ExternalId[] {
    return [
      { externalSystemId: tpSystemId, externalId: name },
      {
        externalSystemId: nameSystemId,
        externalId: this.nameExternalId.forStarPosition(name),
      },
    ];
  }
}
