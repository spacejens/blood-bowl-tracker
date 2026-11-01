import type { PlayerSkillRow } from '@blood-bowl-tracker/game-data';
import { PlayerPricingModelService } from '@blood-bowl-tracker/game-data';
import { Injectable, Logger } from '@nestjs/common';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { ErrorLogService } from '../../shared/error-log.service';

/**
 * Whether the player deepdive should flag gained skills of unknown source:
 * true only when the player's era prices advancements by kind.
 *
 * The era is looked up only when a gained skill could be flagged at all (an
 * `advancement` that is not a free extra), so a player without one, which is
 * every TP player, pays no extra query. Supplementary: a timeout, a failure
 * (logged) or an era with no single pricing model all mean `false`, so the
 * skills show unflagged and the rest of the deepdive is unaffected.
 */
@Injectable()
export class PlayerSkillPricingService {
  private readonly logger = new Logger(PlayerSkillPricingService.name);

  constructor(
    private readonly pricingModel: PlayerPricingModelService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly errorLog: ErrorLogService,
  ) {}

  async pricesByKind(
    playerId: number,
    rows: readonly PlayerSkillRow[],
  ): Promise<boolean> {
    const flaggable = rows.some(
      (row) => row.source === 'advancement' && !row.isFreeExtra,
    );
    if (!flaggable) {
      return false;
    }
    const model = await this.databaseTimeout
      .run(this.pricingModel.pricingModelForPlayer(playerId), null)
      .catch((error: unknown) => {
        this.errorLog.logError(
          this.logger,
          'Failed to look up the advancement pricing model',
          error,
        );
        return null;
      });
    return model === 'kind_priced';
  }
}
