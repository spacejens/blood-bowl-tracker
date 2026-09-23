import type { TpPlayerCharacteristics } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

/**
 * The characteristics subset of an `UpsertPlayer` payload. All five values
 * plus `rulesSetId` travel together or not at all: `UpsertPlayerSchema`
 * rejects a partial set, characteristics without a `rulesSetId`, and a
 * `rulesSetId` without characteristics.
 */
export interface TpPlayerCharacteristicsPayload {
  move: number;
  strength: number;
  agility: number;
  passing: number;
  armour: number;
  rulesSetId: number;
}

@Injectable()
export class TpPlayerCharacteristicsBuilderService {
  /**
   * A roster player's own current characteristics, validated under the
   * rules set the player's era declares. Undefined when the player carried
   * none (a match-embedded-only entry has no `ma/st/ag/pa/av`) or the era
   * declares no single rules set — an omitted group leaves whatever is
   * already stored untouched.
   */
  forRosterPlayer(options: {
    characteristics: TpPlayerCharacteristics | undefined;
    rulesSetId: number | undefined;
  }): TpPlayerCharacteristicsPayload | undefined {
    const { characteristics, rulesSetId } = options;
    if (characteristics === undefined || rulesSetId === undefined) {
      return undefined;
    }
    return { ...characteristics, rulesSetId };
  }
}
