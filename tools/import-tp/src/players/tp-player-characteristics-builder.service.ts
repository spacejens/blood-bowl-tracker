import type { TpPositionCharacteristics } from '@blood-bowl-tracker/parse-tp';
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
 * Builds the characteristics a hired star player's `players.upsert` payload
 * carries: the star position's template values for the hiring era's rules
 * set. Holds no state and performs no I/O.
 */
@Injectable()
export class TpPlayerCharacteristicsBuilderService {
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
    characteristicsByPositionId?: Map<
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
      ?.get(positionId)
      ?.get(rulesSetId);
    if (characteristics === undefined) {
      return undefined;
    }
    return { ...characteristics, rulesSetId };
  }
}
