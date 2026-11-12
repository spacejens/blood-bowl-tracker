import type {
  PlayerSkillEntry,
  SyncPlayerSkills,
  SyncPlayerSkillsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, playerAdvancements, players } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { CuratedOrderStoredRow } from '../player-skills/curated-advancement-order-matcher.service';
import { CuratedAdvancementOrderMatcherService } from '../player-skills/curated-advancement-order-matcher.service';
import { PlayerAdvancementReadsService } from '../player-skills/player-advancement-reads.service';
import { PlayerSkillsService } from '../player-skills/player-skills.service';
import { CuratedAdvancementOrderError } from '../shared/curated-advancement-order-error';
import {
  AdvancementOrderDeductionService,
  MAX_DEDUCED,
} from '../spp/advancement-order-deduction.service';
import { UnspentSppService } from '../spp/unspent-spp.service';
import type { RulesSetAdvancementInput } from '../spp/unspent-spp.types';

/** Why one player's entries are refused, or the entries flagging his stored free extras. */
type PlayerCheck =
  | { problem: string }
  | { problem?: undefined; flagEntries: PlayerSkillEntry[] };

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
 * as "not a paid advancement" instead of being checked as a paid one. The
 * same rules run over the player's stored gained skills: one they make free
 * counts as free in the match and the pricing even while its stored flag is
 * still unset (a row stored before the rule), and the accepted sync flags it.
 * Any player that fails refuses the whole batch before anything is written.
 * An accepted batch is written by PlayerSkillsService.sync, keeping the
 * stored unspent SPP (the check has shown it fits, or the figures are not
 * stored and no check ran). The ids returned line up with the caller's
 * entries.
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
    const flagEntries: PlayerSkillEntry[] = [];
    for (const playerId of playerIds) {
      const check = await this.check(
        playerId,
        resolved.filter((entry) => entry.playerId === playerId),
      );
      if (check.problem !== undefined) {
        problems.push(`Player ${playerId}${check.problem}`);
      } else {
        flagEntries.push(...check.flagEntries);
      }
    }
    if (problems.length > 0) {
      throw new CuratedAdvancementOrderError(problems.join('; '));
    }
    const synced = await this.playerSkills.sync(
      { ...data, entries: [...data.entries, ...flagEntries] },
      { keepUnspentSpp: true },
    );
    // The flag entries were appended, so their ids come last.
    return {
      playerSkillIds: synced.playerSkillIds.slice(0, data.entries.length),
    };
  }

  /**
   * What is wrong with one player's entries, phrased to follow his name, or
   * the entries that flag his stored free extras when nothing is.
   */
  private async check(
    playerId: number,
    entries: PlayerSkillEntry[],
  ): Promise<PlayerCheck> {
    const [player] = await this.db
      .select({ sppTotal: players.sppTotal, unspentSpp: players.unspentSpp })
      .from(players)
      .where(eq(players.id, playerId));
    if (player === undefined) {
      return { problem: ' does not exist' };
    }
    const spent = this.spent(player);
    if (spent === 'inconsistent') {
      return {
        problem:
          ' has an unspent SPP figure outside 0 to the SPP total, so the order cannot be checked against it',
      };
    }
    const { stored, flagEntries } = await this.storedWithFreeExtras(playerId);
    const match = this.matcher.match(entries, stored);
    if (!match.ok) {
      return { problem: ` ${match.problem}` };
    }
    const problem =
      spent === undefined
        ? undefined
        : await this.spendProblem(playerId, {
            rowIdsInOrder: match.rowIdsInOrder,
            freeRowIds: new Set(
              stored.flatMap((row) => (row.isFreeExtra ? [row.id] : [])),
            ),
            spent,
          });
    return problem === undefined ? { flagEntries } : { problem };
  }

  /**
   * The player's stored rows, with each active gained skill the free-extra
   * rules make free (PlayerAdvancementReadsService.resolveFreeExtras) counted
   * as free although its stored flag is still unset, and for each such row
   * an entry that has the sync flag it: the row's own natural key and
   * source, no order, so its stored number stays and is left unconfirmed.
   */
  private async storedWithFreeExtras(playerId: number): Promise<{
    stored: CuratedOrderStoredRow[];
    flagEntries: PlayerSkillEntry[];
  }> {
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
    const unflagged = stored.flatMap((row) =>
      row.skillId === null ||
      row.source === 'starting' ||
      row.source === 'characteristic' ||
      row.isFreeExtra ||
      row.removed
        ? []
        : [{ row, skillId: row.skillId }],
    );
    const resolved = await this.reads.resolveFreeExtras(
      unflagged.map(({ row, skillId }) => ({
        playerId,
        skillId,
        source: row.source,
        attributeValue: row.attributeValue,
      })),
    );
    const freeRowIds = new Set<number>();
    const flagEntries = resolved.flatMap((entry, at) => {
      if (entry.isFreeExtra !== true) {
        return [];
      }
      freeRowIds.add(unflagged[at].row.id);
      return [entry];
    });
    return {
      stored: stored.map((row) =>
        freeRowIds.has(row.id) ? { ...row, isFreeExtra: true } : row,
      ),
      flagEntries,
    };
  }

  /**
   * Why the curated order cannot cost the player's spend, if it cannot. The
   * stored free extras are priced as free, the unflagged ones included.
   */
  private async spendProblem(
    playerId: number,
    order: { rowIdsInOrder: number[]; freeRowIds: Set<number>; spent: number },
  ): Promise<string | undefined> {
    const { rowIdsInOrder, freeRowIds, spent } = order;
    const count = rowIdsInOrder.length;
    if (count === 0) {
      // No paid advancement, so nothing can have been spent on one.
      return spent === 0
        ? undefined
        : ` has no paid advancement, but ${spent} SPP reported as spent`;
    }
    if (count > MAX_DEDUCED) {
      return ` has ${count} paid advancements; at most ${MAX_DEDUCED} can be checked`;
    }
    const inputs = await this.unspentSpp.advancementInputsForPlayers([
      playerId,
    ]);
    const rulesSets = (inputs.get(playerId) ?? []).map((rulesSet) =>
      this.withFreeRows(rulesSet, freeRowIds),
    );
    if (rulesSets.length === 0) {
      return ' has no rules set that prices advancements, so the order cannot be checked against the SPP reported as spent';
    }
    // With every paid row ordered, only the curated assignment can fit.
    const fitted = this.deduction.deduce({
      rulesSets,
      newRowIds: rowIdsInOrder,
      orderedRowIds: rowIdsInOrder,
      firstNumber: 1,
      spent,
    });
    return fitted === undefined
      ? `: this order cannot cost exactly the ${spent} SPP reported as spent under any rules set of the player's era`
      : undefined;
  }

  /** The rules set's input with the given rows marked as free extras. */
  private withFreeRows(
    rulesSet: RulesSetAdvancementInput,
    freeRowIds: Set<number>,
  ): RulesSetAdvancementInput {
    return {
      ...rulesSet,
      candidatesInput: {
        ...rulesSet.candidatesInput,
        skills: rulesSet.candidatesInput.skills.map((row) =>
          freeRowIds.has(row.id) && !row.isFreeExtra
            ? { ...row, isFreeExtra: true }
            : row,
        ),
      },
    };
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
