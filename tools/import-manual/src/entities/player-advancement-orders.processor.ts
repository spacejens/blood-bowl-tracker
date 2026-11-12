import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import { PlayerSkillsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { PlayerAdvancementOrderEntry } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

@Injectable()
export class PlayerAdvancementOrdersProcessor {
  constructor(
    private readonly refResolver: ReferenceResolverService,
    private readonly playerSkills: PlayerSkillsImportService,
  ) {}

  /**
   * Record each hand-curated advancement order (see
   * docs/import-manual/player-advancement-orders.md). The player and the
   * skills resolve by external id like every other reference here; an
   * unresolved one skips the entry with an ImportError. Each entry goes to
   * `playerSkills.sync` on its own, confirmed and numbered from 1, with
   * `checkOrderAgainstSpend`, so the server refuses an order that does not
   * match the player's stored paid advancements or, when his SPP figures are
   * stored, the SPP he reported as spent. A refusal is recorded as an ImportError and writes nothing.
   * Skills go as `advancement`, which never replaces a stored chosen or
   * random source. An entry listing no advancements goes with no skill entries: the server accepts it only for a player with no paid advancement and flags his stored free extras. Returns how many skill entries were written.
   */
  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.playerAdvancementOrders) {
      const entries = await this.entries(entry, ctx);
      if (entries === undefined) {
        continue;
      }
      const synced = await this.playerSkills.syncPlayerSkills(
        {
          entries: entries.list,
          characteristicPlayerIds: [entries.playerId],
          checkOrderAgainstSpend: true,
        },
        ctx.errors,
      );
      if (synced > 0) {
        imported += 1;
      }
    }
    return imported;
  }

  /** The sync entries for one curated order, or undefined when a reference fails. */
  private async entries(
    entry: PlayerAdvancementOrderEntry,
    ctx: ProcessContext,
  ): Promise<{ playerId: number; list: PlayerSkillEntry[] } | undefined> {
    const label = `Cannot import the advancement order of player ${entry.player.system} ${entry.player.id}`;
    const common = {
      systemIds: ctx.systemIds,
      errors: ctx.errors,
      item: entry,
      label,
    };
    const playerId = await this.refResolver.resolveRef({
      ...common,
      ref: entry.player,
      kind: 'player',
    });
    if (playerId === undefined) {
      return undefined;
    }
    const skillRefs = entry.advancements.flatMap((advancement) =>
      'skill' in advancement ? [advancement.skill] : [],
    );
    const skillIds = await this.refResolver.resolveRefs({
      ...common,
      refs: skillRefs,
      kind: 'skill',
    });
    if (skillIds === undefined) {
      return undefined;
    }
    let nextSkill = 0;
    const list = entry.advancements.map((advancement, at): PlayerSkillEntry => {
      const order = { advancementOrder: at + 1, orderConfirmed: true };
      if ('skill' in advancement) {
        const skillId = skillIds[nextSkill];
        nextSkill += 1;
        return {
          playerId,
          skillId,
          source: 'advancement',
          attributeValue: advancement.attributeValue ?? null,
          ...order,
        };
      }
      return {
        playerId,
        source: 'characteristic',
        characteristic: advancement.characteristic,
        ...order,
      };
    });
    return { playerId, list };
  }
}
