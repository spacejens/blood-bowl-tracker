import type {
  PlayerSkillEntry,
  SyncPlayerSkills,
  SyncPlayerSkillsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, playerAdvancements, players } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { CuratedAdvancementOrderMatcherService } from '../player-skills/curated-advancement-order-matcher.service';
import { PlayerSkillsService } from '../player-skills/player-skills.service';
import { CuratedAdvancementOrderError } from '../shared/curated-advancement-order-error';
import {
  AdvancementOrderDeductionService,
  MAX_DEDUCED,
} from '../spp/advancement-order-deduction.service';
import { UnspentSppService } from '../spp/unspent-spp.service';

/**
 * Writes hand-curated advancement orders (`playerSkills.sync` with
 * `checkOrderAgainstSpend`) only when each one fits what is known about
 * the player. For every player the batch names, the entries must match his
 * stored paid advancements one for one
 * (CuratedAdvancementOrderMatcherService). The curated order, as the only
 * order allowed, must also cost exactly the SPP he reports as spent (stored
 * total minus stored unspent) under some rules set of his era, priced by
 * AdvancementOrderDeductionService. Any player that fails refuses the whole
 * batch before anything is written. An accepted batch is written by
 * PlayerSkillsService.sync, keeping the stored unspent SPP the check has
 * just shown to fit.
 */
@Injectable()
export class CuratedAdvancementOrderService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly playerSkills: PlayerSkillsService,
    private readonly unspentSpp: UnspentSppService,
    private readonly deduction: AdvancementOrderDeductionService,
    private readonly matcher: CuratedAdvancementOrderMatcherService,
  ) {}

  async sync(data: SyncPlayerSkills): Promise<SyncPlayerSkillsResult> {
    const playerIds = [
      ...new Set([
        ...data.entries.map((entry) => entry.playerId),
        ...(data.characteristicPlayerIds ?? []),
      ]),
    ];
    const problems: string[] = [];
    for (const playerId of playerIds) {
      const problem = await this.problem(
        playerId,
        data.entries.filter((entry) => entry.playerId === playerId),
      );
      if (problem !== undefined) {
        problems.push(`Player ${playerId}${problem}`);
      }
    }
    if (problems.length > 0) {
      throw new CuratedAdvancementOrderError(problems.join('; '));
    }
    return this.playerSkills.sync(data, { keepUnspentSpp: true });
  }

  /** What is wrong with one player's entries, phrased to follow his name. */
  private async problem(
    playerId: number,
    entries: PlayerSkillEntry[],
  ): Promise<string | undefined> {
    const [player] = await this.db
      .select({ sppTotal: players.sppTotal, unspentSpp: players.unspentSpp })
      .from(players)
      .where(eq(players.id, playerId));
    if (player === undefined) {
      return ' does not exist';
    }
    const spent = this.spent(player);
    if (spent === undefined) {
      return ' has no consistent reported SPP total and unspent figure to check the order against';
    }
    const stored = await this.db
      .select({
        id: playerAdvancements.id,
        skillId: playerAdvancements.skillId,
        characteristic: playerAdvancements.characteristic,
        attributeValue: playerAdvancements.attributeValue,
        source: playerAdvancements.source,
        isFreeExtra: playerAdvancements.isFreeExtra,
        removed: playerAdvancements.removed,
      })
      .from(playerAdvancements)
      .where(eq(playerAdvancements.playerId, playerId));
    const match = this.matcher.match(entries, stored);
    if (!match.ok) {
      return ` ${match.problem}`;
    }
    const count = match.rowIdsInOrder.length;
    if (count > MAX_DEDUCED) {
      return ` has ${count} paid advancements; at most ${MAX_DEDUCED} can be checked`;
    }
    const inputs = await this.unspentSpp.advancementInputsForPlayers([
      playerId,
    ]);
    // With every paid row ordered, only the curated assignment can fit.
    const fitted = this.deduction.deduce({
      rulesSets: inputs.get(playerId) ?? [],
      newRowIds: match.rowIdsInOrder,
      orderedRowIds: match.rowIdsInOrder,
      firstNumber: 1,
      spent,
    });
    return fitted === undefined
      ? `: this order cannot cost exactly the ${spent} SPP reported as spent under any rules set of the player's era`
      : undefined;
  }

  /** Stored total minus stored unspent, when both are known and consistent. */
  private spent(player: {
    sppTotal: number | null;
    unspentSpp: number | null;
  }): number | undefined {
    const { sppTotal, unspentSpp } = player;
    if (
      sppTotal === null ||
      unspentSpp === null ||
      unspentSpp < 0 ||
      unspentSpp > sppTotal
    ) {
      return undefined;
    }
    return sppTotal - unspentSpp;
  }
}
