import type {
  TpPlayerCharacteristics,
  TpPositionCharacteristics,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

/**
 * The characteristics subset of an `UpsertPlayer` payload. All five values
 * plus `rulesSetId` travel together or not at all: `UpsertPlayerSchema`
 * rejects a partial set, rejects characteristics without a `rulesSetId`, and
 * rejects a `rulesSetId` without characteristics.
 */
export interface TpPlayerCharacteristicsPayload {
  move: number;
  strength: number;
  agility: number;
  passing: number;
  armour: number;
  rulesSetId: number;
}

/**
 * Builds the characteristics fields the TP players importer attaches to its
 * `players.upsert` payloads. Split out of `TpPlayersImportService` to keep
 * that file under the repo's source-file line cap; it holds no state and
 * performs no I/O.
 */
@Injectable()
export class TpPlayerCharacteristicsBuilderService {
  /**
   * A player's characteristics, validated under the rules set their era
   * declares. Prefers the player's own current values (from a `lineUps[]`
   * entry) when present. Falls back to the recruited position's accumulated
   * template characteristics -- the same values `TpPositionsImportService`
   * already collected per rules set -- for the two cases where no
   * player-specific line exists: a player known only from a match-embedded
   * snapshot (one who has since left the roster the standalone
   * `rosters_<id>.json` file reflects, so it carries no `ma/st/ag/pa/av` for
   * them), and a star player hired mid-season via an `inducements_roll`
   * event, which has no `lineUps[]` entry at all. This mirrors #671's own
   * model of a player's characteristics: seeded from their position's, free
   * to differ once real per-player data exists.
   *
   * Returns `undefined` when the era resolved to no single rules set, or when
   * neither the player's own values nor the position fallback are available
   * -- an omitted group leaves whatever is already stored untouched. A
   * missing position fallback is not an error here: the positions step that
   * produced `characteristicsByPositionId` would already have recorded one if
   * something were wrong upstream.
   */
  forRosterPlayer(options: {
    characteristics: TpPlayerCharacteristics | undefined;
    positionId: number;
    eraName: string;
    rulesSetIdByEraName: Map<string, number>;
    characteristicsByPositionId?: Map<
      number,
      Map<number, TpPositionCharacteristics>
    >;
  }): TpPlayerCharacteristicsPayload | undefined {
    const {
      characteristics,
      positionId,
      eraName,
      rulesSetIdByEraName,
      characteristicsByPositionId,
    } = options;
    const rulesSetId = rulesSetIdByEraName.get(eraName);
    if (rulesSetId === undefined) {
      return undefined;
    }
    if (characteristics !== undefined) {
      return { ...characteristics, rulesSetId };
    }
    const positionCharacteristics = characteristicsByPositionId
      ?.get(positionId)
      ?.get(rulesSetId);
    if (positionCharacteristics === undefined) {
      return undefined;
    }
    return { ...positionCharacteristics, rulesSetId };
  }
}
