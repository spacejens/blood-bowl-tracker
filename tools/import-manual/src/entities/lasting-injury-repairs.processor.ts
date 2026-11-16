import { IncompletePlayerFillImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

@Injectable()
export class LastingInjuryRepairsProcessor {
  constructor(
    private readonly refResolver: ReferenceResolverService,
    private readonly fills: IncompletePlayerFillImportService,
  ) {}

  /**
   * Ask the server to record the lasting stat reductions of each listed TP
   * player (`players.recordLastingReductions`; see
   * docs/import-manual/filling-missing-players.md#recording-lasting-reductions).
   * The player resolves by external id; an unresolved one skips the entry
   * with an ImportError. A refusal is recorded as an ImportError and the
   * other entries still run. Returns how many entries the server accepted,
   * those it left unchanged included.
   */
  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.lastingInjuryRepairs) {
      const playerId = await this.refResolver.resolveRef({
        ref: entry.player,
        kind: 'player',
        item: entry,
        label: `Cannot record the lasting reductions of player ${entry.player.system} ${entry.player.id}`,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
      });
      if (playerId === undefined) {
        continue;
      }
      const result = await this.fills.recordLastingReductions(
        { playerId },
        ctx.errors,
      );
      if (result !== undefined) {
        imported += 1;
      }
    }
    return imported;
  }
}
