import type {
  PlayerSkillEntry,
  SyncPlayerSkills,
  SyncPlayerSkillsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, playerAdvancements, players } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { CuratedAdvancementOrderMatcherService } from '../player-skills/curated-advancement-order-matcher.service';
import { PlayerAdvancementReadsService } from '../player-skills/player-advancement-reads.service';
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
 * AdvancementOrderDeductionService. That check runs whenever both stored
 * figures are known; when either is missing (a scratch import's first TP
 * pass stores no unspent SPP yet) nothing reported contradicts the order, so
 * it is accepted unchecked. Figures that contradict each other, or a player
 * no rules set prices, refuse. Entries are first run through
 * PlayerAdvancementReadsService.resolveFreeExtras, so a skill the sync would
 * store as a free extra (Hatred, Loner, a trophy-granted skill) is refused
 * as "not a paid advancement" instead of being checked as a paid one. Any
 * player that fails refuses the whole batch before anything is written. An
 * accepted batch is written by PlayerSkillsService.sync, keeping the stored
 * unspent SPP (the check has shown it fits, or the figures are not stored
 * and no check ran).
 *
 * The reads and pricing happen before, not inside, the sync transaction, so
 * a concurrent write between them is not excluded; manual imports run one
 * at a time.
 */
@Injectable()
export class CuratedAdvancementOrderService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly playerSkills: PlayerSkillsService,
    private readonly unspentSpp: UnspentSppService,
    private readonly deduction: AdvancementOrderDeductionService,
    private readonly matcher: CuratedAdvancementOrderMatcherService,
    private readonly reads: PlayerAdvancementReadsService,
  ) {}

  async sync(data: SyncPlayerSkills): Promise<SyncPlayerSkillsResult> {
    const playerIds = [
      ...new Set([
        ...data.entries.map((entry) => entry.playerId),
        ...(data.characteristicPlayerIds ?? []),
      ]),
    ];
    const resolved = await this.reads.resolveFreeExtras(data.entries);
    const problems: string[] = [];
    for (const playerId of playerIds) {
      const problem = await this.problem(
        playerId,
        resolved.filter((entry) => entry.playerId === playerId),
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
    if (spent === 'inconsistent') {
      return ' has an unspent SPP figure outside 0 to the SPP total, so the order cannot be checked against it';
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
    if (spent === undefined) {
      return undefined;
    }
    const count = match.rowIdsInOrder.length;
    if (count > MAX_DEDUCED) {
      return ` has ${count} paid advancements; at most ${MAX_DEDUCED} can be checked`;
    }
    const inputs = await this.unspentSpp.advancementInputsForPlayers([
      playerId,
    ]);
    const rulesSets = inputs.get(playerId) ?? [];
    if (rulesSets.length === 0) {
      return ' has no rules set that prices advancements, so the order cannot be checked against the SPP reported as spent';
    }
    // With every paid row ordered, only the curated assignment can fit.
    const fitted = this.deduction.deduce({
      rulesSets,
      newRowIds: match.rowIdsInOrder,
      orderedRowIds: match.rowIdsInOrder,
      firstNumber: 1,
      spent,
    });
    return fitted === undefined
      ? `: this order cannot cost exactly the ${spent} SPP reported as spent under any rules set of the player's era`
      : undefined;
  }

  /**
   * Stored total minus stored unspent; `undefined` when either is unknown
   * (nothing to check against), `'inconsistent'` when they contradict.
   */
  private spent(player: {
    sppTotal: number | null;
    unspentSpp: number | null;
  }): number | 'inconsistent' | undefined {
    const { sppTotal, unspentSpp } = player;
    if (sppTotal === null || unspentSpp === null) {
      return undefined;
    }
    if (unspentSpp < 0 || unspentSpp > sppTotal) {
      return 'inconsistent';
    }
    return sppTotal - unspentSpp;
  }
}
