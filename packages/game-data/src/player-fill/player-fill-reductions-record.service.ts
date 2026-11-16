import type {
  RecordLastingReductions,
  RecordLastingReductionsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, players } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { IncompletePlayerFillError } from '../shared/incomplete-player-fill-error';
import { PlayerFillReductionsService } from './player-fill-reductions.service';
import { PlayerFillStateService } from './player-fill-state.service';

/**
 * Records the lasting stat reductions of one complete TP player who has none
 * stored (`players.recordLastingReductions`; see
 * docs/import-manual/filling-missing-players.md#recording-lasting-reductions),
 * for players filled before fills recorded them.
 *
 * The player must exist, have a TP external id, not be a star player and no
 * longer be counted as incomplete; otherwise the call is refused with an
 * IncompletePlayerFillError. A player with any reduction count stored is
 * left as he is, so recorded state is never overwritten. Otherwise the
 * counts PlayerFillReductionsService derives from his stored line and active
 * characteristic increases are written, when any is above 0. Only the five
 * reduction columns are written.
 */
@Injectable()
export class PlayerFillReductionsRecordService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly state: PlayerFillStateService,
    private readonly reductions: PlayerFillReductionsService,
  ) {}

  async record(
    data: RecordLastingReductions,
  ): Promise<RecordLastingReductionsResult> {
    const { playerId } = data;
    const refuse = (problem: string): IncompletePlayerFillError =>
      new IncompletePlayerFillError(`Player ${playerId}${problem}`);
    const state = await this.state.load(playerId);
    if (state === undefined) {
      throw refuse(' does not exist');
    }
    if (state.tpExternalId === undefined) {
      throw refuse(' is not a TP player');
    }
    if (state.isStarPlayer) {
      throw refuse(' is a star player');
    }
    if (state.incomplete) {
      throw refuse(
        ' is still incomplete: fill him in before recording his lasting reductions',
      );
    }
    const unchanged: RecordLastingReductionsResult = {
      playerId,
      outcome: 'unchanged',
    };
    if (Object.values(state.reductions).some((count) => count > 0)) {
      return unchanged;
    }
    const { move, strength, agility, passing, armour } = state.fields;
    const derived = await this.reductions.derive({
      positionId: state.positionId,
      eraId: state.eraId,
      line: { move, strength, agility, passing, armour },
      increases: state.rows.flatMap((row) =>
        row.source === 'characteristic' && row.characteristic !== null
          ? [row.characteristic]
          : [],
      ),
    });
    if (Object.values(derived).every((count) => count === 0)) {
      return unchanged;
    }
    await this.db.update(players).set(derived).where(eq(players.id, playerId));
    return { playerId, outcome: 'recorded' };
  }
}
