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
   * A roster player's own current characteristics, validated under the rules
   * set the player's era declares. Returns `undefined` when the player carried
   * none (a match-embedded-only entry: `lineUps[]` snapshots inside a match
   * file have no `ma/st/ag/pa/av`) or when the era resolved to no single rules
   * set -- an omitted group leaves whatever is already stored untouched.
   */
  forRosterPlayer(options: {
    characteristics: TpPlayerCharacteristics | undefined;
    eraName: string;
    rulesSetIdByEraName: Map<string, number>;
  }): TpPlayerCharacteristicsPayload | undefined {
    const { characteristics, eraName, rulesSetIdByEraName } = options;
    if (characteristics === undefined) {
      return undefined;
    }
    const rulesSetId = rulesSetIdByEraName.get(eraName);
    if (rulesSetId === undefined) {
      return undefined;
    }
    return { ...characteristics, rulesSetId };
  }

  /**
   * A star player hired mid-season via an `inducements_roll` event has no
   * `lineUps[]` entry, so no characteristics of their own; a freshly-hired
   * star's values are the position template's, which the positions import step
   * already accumulated per rules set. Returns `undefined` when the position
   * has no accumulated characteristics for this era's rules set -- unexpected,
   * but not an error here: the positions step would already have recorded one
   * if something were wrong upstream.
   */
  forStarPosition(options: {
    positionId: number;
    eraName: string;
    rulesSetIdByEraName: Map<string, number>;
    characteristicsByPositionId: Map<
      number,
      Map<number, TpPositionCharacteristics>
    >;
  }): TpPlayerCharacteristicsPayload | undefined {
    const {
      positionId,
      eraName,
      rulesSetIdByEraName,
      characteristicsByPositionId,
    } = options;
    const rulesSetId = rulesSetIdByEraName.get(eraName);
    if (rulesSetId === undefined) {
      return undefined;
    }
    const characteristics = characteristicsByPositionId
      .get(positionId)
      ?.get(rulesSetId);
    if (characteristics === undefined) {
      return undefined;
    }
    return { ...characteristics, rulesSetId };
  }
}
