import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  NameExternalIdService,
  PlayersImportService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import type {
  TpInducedStarPlayer,
  TpPositionCharacteristics,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpPlayerCharacteristicsBuilderService } from './tp-player-characteristics-builder.service';

/**
 * One hired-star-player group: the roster that hired them, the real era the
 * hiring match's competition belongs to (so a roster id imported under
 * several eras resolves its team era unambiguously instead of guessing), and
 * the star players themselves.
 */
export interface InducedStarPlayerHireGroup {
  rosterId: number;
  eraId: number;
  starPlayers: TpInducedStarPlayer[];
}

/** Options for {@link TpInducedStarPlayersImportService.importHires}, bundled
 * into one object to stay within the repo's 3-parameter limit. */
export interface ImportHiresOptions {
  groups: InducedStarPlayerHireGroup[];
  teamErasByRosterId: Map<number, { id: number; eraId: number }[]>;
  context: {
    tpSystemId: number;
    nameSystemId: number;
    eraNameByEraId: Map<number, string>;
    rulesSetIdByEraName: Map<string, number>;
    /**
     * Each Position's accumulated characteristics, keyed by DB position id
     * then rules set DB id. The server builds these (via
     * `packages/import-tp-live`'s `TpOfficialCharacteristicsSyncService`)
     * and returns them as `positionCharacteristics` in the
     * `tpOfficialTeams.import` result; this tool's own
     * `TpOfficialTeamsFilesImportService` (in `tools/import-tp/src/official-teams/`)
     * assembles them into this map. A star hired mid-season via an
     * `inducements_roll` event has no `lineUps[]` entry, so no
     * characteristics of their own -- a freshly-hired star's are the
     * position template's. Optional -- callers/tests that don't exercise star
     * hires can omit it.
     */
    characteristicsByPositionId?: Map<
      number,
      Map<number, TpPositionCharacteristics>
    >;
  };
  errors: ImportError[];
}

/**
 * Imports star players hired mid-season via an `inducements_roll` match
 * event. Kept in its own file (and spec), under the repo's line caps, since
 * the hire loop is a self-contained block with its own inputs and its own
 * output map; called by `TpInducedStarPlayersStepService`.
 */
@Injectable()
export class TpInducedStarPlayersImportService {
  constructor(
    private readonly positionsImport: PositionsImportService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly characteristicsBuilder: TpPlayerCharacteristicsBuilderService,
    private readonly playersImport: PlayersImportService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * `starPlayerIdsByRosterAndMaster` is keyed by roster and `lineUpMasterId`
   * because match events reference a star by master id within a roster,
   * never by a `lineUps[].id`.
   */
  async importHires({
    groups,
    teamErasByRosterId,
    context,
    errors,
  }: ImportHiresOptions): Promise<{
    imported: number;
    starPlayerIdsByRosterAndMaster: Map<string, number>;
    insertedPlayerIds: number[];
  }> {
    const {
      tpSystemId,
      nameSystemId,
      eraNameByEraId,
      rulesSetIdByEraName,
      characteristicsByPositionId,
    } = context;

    let imported = 0;
    const starPlayerIdsByRosterAndMaster = new Map<string, number>();
    const insertedPlayerIds: number[] = [];
    const seenStarPlayerKeys = new Set<string>();

    for (const { rosterId, eraId, starPlayers } of groups) {
      const teamEra = teamErasByRosterId
        .get(rosterId)
        ?.find((te) => te.eraId === eraId);
      if (teamEra === undefined) {
        errors.push(
          this.importResults.error({
            item: { rosterId },
            message: `Skipped ${starPlayers.length} hired star player(s) for roster ${rosterId}: could not resolve hiring team era`,
          }),
        );
        continue;
      }

      for (const starPlayer of starPlayers) {
        const key = `${rosterId}:${starPlayer.lineUpMasterId}`;
        if (seenStarPlayerKeys.has(key)) {
          continue;
        }
        seenStarPlayerKeys.add(key);

        const position = await this.positionsImport.upsert(
          {
            name: starPlayer.name,
            isStarPlayer: true,
            externalIds: [
              { externalSystemId: tpSystemId, externalId: starPlayer.name },
              {
                externalSystemId: nameSystemId,
                externalId: this.nameExternalId.forStarPosition(
                  starPlayer.name,
                ),
              },
            ],
          },
          errors,
        );
        if (!position) {
          continue;
        }

        // A star hired mid-season has no lineUps[] entry, so no
        // characteristics of their own: use the star position's template
        // values for the hiring era's rules set. Missing values are not an
        // error here -- the positions step that produced this map would
        // already have recorded one if something were wrong upstream.
        const starEraName = eraNameByEraId.get(eraId);
        const starCharacteristics =
          starEraName === undefined
            ? undefined
            : this.characteristicsBuilder.forStarPosition({
                positionId: position.id,
                eraName: starEraName,
                rulesSetIdByEraName,
                characteristicsByPositionId,
              });

        const upserted = await this.playersImport.upsertPlayerResult(
          {
            name: starPlayer.name,
            teamEraId: teamEra.id,
            positionId: position.id,
            ...starCharacteristics,
            externalIds: [
              {
                externalSystemId: tpSystemId,
                externalId: `star-${rosterId}-${starPlayer.lineUpMasterId}`,
              },
            ],
          },
          errors,
        );
        if (upserted) {
          imported += 1;
          starPlayerIdsByRosterAndMaster.set(key, upserted.id);
          if (upserted.created) {
            insertedPlayerIds.push(upserted.id);
          }
        }
      }
    }

    return { imported, starPlayerIdsByRosterAndMaster, insertedPlayerIds };
  }
}
