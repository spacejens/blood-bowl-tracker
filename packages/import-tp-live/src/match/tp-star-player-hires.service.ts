import type {
  ExternalId,
  ImportError,
  ImportResult,
  TpHiredStarPlayer,
} from '@blood-bowl-tracker/api-contract';
import { NAME_EXTERNAL_SYSTEM } from '@blood-bowl-tracker/domain-enums';
import {
  ExternalSystemsService,
  PlayersService,
  PositionRulesSetsService,
  PositionsService,
} from '@blood-bowl-tracker/game-data';
import {
  ImportResultService,
  NameExternalIdService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import type {
  TpInducedStarPlayer,
  TpMatch,
} from '@blood-bowl-tracker/parse-tp';
import { TpStarHireKeyService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import type { TpMatchContext } from './tp-match-context.service';

/** Options for {@link TpStarPlayerHiresService.importHires}. */
export interface ImportStarPlayerHiresOptions {
  match: TpMatch;
  /** The match's resolved context: its TP system, era and both team eras. */
  context: TpMatchContext;
}

/** What {@link TpStarPlayerHiresService.importHires} did. */
export interface TpStarPlayerHiresOutcome {
  /** `imported` counts the hired players upserted. */
  result: ImportResult;
  /** Every hired player upserted, each once. */
  hiredStarPlayers: TpHiredStarPlayer[];
}

/** One star player hired by one roster in the match. */
interface StarPlayerHire {
  rosterId: number;
  /** The hiring side's team era; undefined for a roster on neither side. */
  teamEraId: number | undefined;
  starPlayer: TpInducedStarPlayer;
}

/** The two external systems a hire is keyed under. */
interface SystemIds {
  tpSystemId: number;
  nameSystemId: number;
}

/** Options for {@link TpStarPlayerHiresService.importHire}. */
interface ImportHireOptions {
  hire: StarPlayerHire;
  context: TpMatchContext;
  nameSystemId: number;
  errors: ImportError[];
}

/**
 * Imports the star players a match's teams hired through an
 * `inducements_roll` event: a step of every match import, bulk
 * (`tpMatches.import`) and live alike. A hired star is on no roster, so the
 * match's own events are the only place the hire shows up. Each hire upserts
 * the star's position (keyed exactly like the official team list import keys
 * a star: its bare name as a TP id plus its Name id, so both land on one row)
 * and a player in the hiring team's era, keyed by the TP id
 * packages/parse-tp's TpStarHireKeyService builds for the hire, so
 * re-importing a hire updates one row. A freshly hired star has no stat line
 * of its own, so the position's catalog baseline for the match's era is used;
 * the official team list must already be imported. Every failure is one
 * ImportError for that hire; the other hires are still imported.
 */
@Injectable()
export class TpStarPlayerHiresService {
  constructor(
    private readonly externalSystems: ExternalSystemsService,
    private readonly positions: PositionsService,
    private readonly positionRulesSets: PositionRulesSetsService,
    private readonly players: PlayersService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
    private readonly recorder: UpsertRecorderService,
    private readonly starHireKey: TpStarHireKeyService,
  ) {}

  /**
   * Imports every distinct `(rosterId, lineUpMasterId)` hire in the match.
   * A match hiring no star touches nothing, not even the Name system.
   */
  async importHires({
    match,
    context,
  }: ImportStarPlayerHiresOptions): Promise<TpStarPlayerHiresOutcome> {
    const errors: ImportError[] = [];
    const hiredStarPlayers: TpHiredStarPlayer[] = [];
    const outcome = (): TpStarPlayerHiresOutcome => ({
      result: this.importResults.result({
        imported: hiredStarPlayers.length,
        errors,
      }),
      hiredStarPlayers,
    });
    const hires = this.collectHires(match, context);
    if (hires.length === 0) {
      return outcome();
    }
    const nameSystem = await this.recorder.record({
      run: () => this.externalSystems.upsert(NAME_EXTERNAL_SYSTEM),
      item: { externalSystems: [NAME_EXTERNAL_SYSTEM.name] },
      errors,
      buildErrorMessage: (error) => this.recorder.messageOf(error),
    });
    if (nameSystem === undefined) {
      return outcome();
    }
    for (const hire of hires) {
      const hired = await this.importHire({
        hire,
        context,
        nameSystemId: nameSystem.system.id,
        errors,
      });
      if (hired !== undefined) {
        hiredStarPlayers.push(hired);
      }
    }
    return outcome();
  }

  /** Every distinct hire, in event order, deduplicated by roster and master id. */
  private collectHires(
    match: TpMatch,
    context: TpMatchContext,
  ): StarPlayerHire[] {
    const hires = new Map<string, StarPlayerHire>();
    for (const event of match.matchEvents) {
      if (event.type !== 'inducements_roll') {
        continue;
      }
      const teamEraId = this.teamEraIdFor(event.rosterId, match, context);
      for (const starPlayer of event.starPlayers) {
        const key = `${event.rosterId}:${starPlayer.lineUpMasterId}`;
        if (!hires.has(key)) {
          hires.set(key, { rosterId: event.rosterId, teamEraId, starPlayer });
        }
      }
    }
    return [...hires.values()];
  }

  /** The hiring side's team era, by whichever side's TP roster id matches. */
  private teamEraIdFor(
    rosterId: number,
    match: TpMatch,
    context: TpMatchContext,
  ): number | undefined {
    if (rosterId === match.homeTeamTpId) {
      return context.homeTeamEraId;
    }
    if (rosterId === match.awayTeamTpId) {
      return context.awayTeamEraId;
    }
    return undefined;
  }

  /** Imports one hire; its player when upserted. */
  private async importHire({
    hire,
    context,
    nameSystemId,
    errors,
  }: ImportHireOptions): Promise<TpHiredStarPlayer | undefined> {
    const { rosterId, teamEraId, starPlayer } = hire;
    const { name, lineUpMasterId } = starPlayer;
    const { tpSystemId, eraId } = context;
    const item = { rosterId, lineUpMasterId, starPlayer: name };
    if (teamEraId === undefined) {
      errors.push(
        this.importResults.error({
          item,
          message: `Skipped hired star player "${name}" (roster ${rosterId}): could not resolve the hiring team era`,
        }),
      );
      return undefined;
    }

    const upserted = await this.recorder.record({
      run: () =>
        this.positions.upsert({
          name,
          isStarPlayer: true,
          externalIds: this.positionExternalIds(name, {
            tpSystemId,
            nameSystemId,
          }),
        }),
      item,
      errors,
      buildErrorMessage: (error) =>
        `Failed to upsert star player position "${name}": ${this.recorder.messageOf(error)}`,
    });
    if (upserted === undefined) {
      return undefined;
    }
    const positionId = upserted.position.id;

    // Wrapped so a lookup that found nothing is told apart from one that threw.
    const lookup = await this.recorder.record({
      run: async () => ({
        found: await this.positionRulesSets.findCharacteristicsContext(
          positionId,
          eraId,
        ),
      }),
      item,
      errors,
      buildErrorMessage: (error) =>
        `Failed to look up the characteristics of star player position "${name}" (position ${positionId}, era ${eraId}): ${this.recorder.messageOf(error)}`,
    });
    if (lookup === undefined) {
      return undefined;
    }
    const baseline = lookup.found?.baseline;
    if (lookup.found === undefined || baseline === undefined) {
      errors.push(
        this.importResults.error({
          item,
          message: `Skipped hired star player "${name}" (roster ${rosterId}): position ${positionId} has no catalog characteristics in era ${eraId}; import the official team list first`,
        }),
      );
      return undefined;
    }
    const { rulesSetId } = lookup.found;

    const player = await this.recorder.record({
      run: () =>
        this.players.upsert({
          name,
          teamEraId,
          positionId,
          ...baseline,
          rulesSetId,
          externalIds: [
            {
              externalSystemId: tpSystemId,
              externalId: this.starHireKey.externalId({
                rosterId,
                lineUpMasterId,
              }),
            },
          ],
        }),
      item,
      errors,
      buildErrorMessage: (error) =>
        `Failed to upsert hired star player "${name}" (roster ${rosterId}): ${this.recorder.messageOf(error)}`,
    });
    return player === undefined
      ? undefined
      : { playerId: player.player.id, created: player.created };
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
