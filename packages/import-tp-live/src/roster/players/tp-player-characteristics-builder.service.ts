import type { UpsertPlayerCharacteristics } from '@blood-bowl-tracker/api-contract';
import type { TpPlayerCharacteristics } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

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
  }): UpsertPlayerCharacteristics | undefined {
    const { characteristics, rulesSetId } = options;
    if (characteristics === undefined || rulesSetId === undefined) {
      return undefined;
    }
    return { ...characteristics, rulesSetId };
  }
}
