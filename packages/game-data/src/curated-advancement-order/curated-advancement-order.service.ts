import type {
  PlayerSkillEntry,
  SyncPlayerSkills,
  SyncPlayerSkillsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, players } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { CuratedAdvancementOrderMatcherService } from '../player-skills/curated-advancement-order-matcher.service';
import { PlayerAdvancementReadsService } from '../player-skills/player-advancement-reads.service';
import { PlayerSkillsService } from '../player-skills/player-skills.service';
import { CuratedAdvancementOrderError } from '../shared/curated-advancement-order-error';
import type { StoredWithFreeExtras } from '../spp/advancement-order-spend-check.service';
import { AdvancementOrderSpendCheckService } from '../spp/advancement-order-spend-check.service';

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
 * total minus stored unspent) under some rules set of his era, checked by
 * AdvancementOrderSpendCheckService. That check runs whenever both stored
 * figures are known; when either is missing (a scratch import's first TP
 * pass stores no unspent SPP yet) nothing reported contradicts the order, so
 * it is accepted after the match alone, and the reported SPP adjustments sync
 * rechecks it once it stores both figures. Figures that contradict each other, or a player
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
    private readonly spendCheck: AdvancementOrderSpendCheckService,
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
    const reported = this.spendCheck.reportedSpend(player);
    if (reported.kind === 'inconsistent') {
      return { problem: reported.problem };
    }
    const { stored, freeRowIds, flagEntries } = this.ofPlayer(
      await this.spendCheck.storedWithFreeExtras([playerId]),
      playerId,
    );
    const match = this.matcher.match(entries, stored);
    if (!match.ok) {
      return { problem: ` ${match.problem}` };
    }
    if (reported.kind === 'unknown') {
      return { flagEntries };
    }
    const problems = await this.spendCheck.spendProblems([
      {
        playerId,
        rowIdsInOrder: match.rowIdsInOrder,
        freeRowIds,
        spent: reported.spent,
      },
    ]);
    const problem = problems.get(playerId);
    return problem === undefined ? { flagEntries } : { problem };
  }

  /** The player's stored rows, or none when he has no row. */
  private ofPlayer(
    byPlayer: Map<number, StoredWithFreeExtras>,
    playerId: number,
  ): StoredWithFreeExtras {
    return (
      byPlayer.get(playerId) ?? {
        stored: [],
        freeRowIds: new Set(),
        flagEntries: [],
      }
    );
  }
}
