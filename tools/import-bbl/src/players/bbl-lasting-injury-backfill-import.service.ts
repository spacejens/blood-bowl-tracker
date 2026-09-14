import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  DEFAULT_BATCH_CHUNK_SIZE,
  ImportResultService,
  LastingInjuriesImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/**
 * Manufactures the `players_history` versions a player inserted by THIS run
 * needs for a lasting injury that was already healed before it.
 *
 * Must run after the match-events step: the server recomputes each player's
 * accumulated niggling injuries and stat reductions from `match_events`, and
 * `match_events` rows foreign-key into `players.id`, so the players step
 * necessarily runs first and the accumulated data does not exist yet at
 * player-insert time. That ordering is the whole reason this is its own final
 * step rather than something folded into the players step.
 *
 * Scoped to players this run INSERTED. An existing player already carries
 * whatever history earlier runs built for them; re-manufacturing it would add
 * a spurious version pair on every import.
 *
 * Idempotent in the sense that matters: a rerun over a database that already
 * has the right current state and the right history writes nothing, because
 * a second run inserts no players and therefore sends no ids.
 */
@Injectable()
export class BblLastingInjuryBackfillImportService {
  constructor(
    private readonly lastingInjuries: LastingInjuriesImportService,
    private readonly importResults: ImportResultService,
  ) {}

  async importLastingInjuryHistory(
    insertedPlayerIds: number[],
  ): Promise<{ result: ImportResult }> {
    const errors: ImportError[] = [];
    let imported = 0;

    // Chunk rather than sending every player in one RPC call: an unbounded
    // payload risks Postgres's bind-parameter limit as the league grows, and
    // it makes one transport hiccup cost the entire step. Each chunk is an
    // independent call, so a failure in one doesn't stop the others.
    for (
      let i = 0;
      i < insertedPlayerIds.length;
      i += DEFAULT_BATCH_CHUNK_SIZE
    ) {
      const chunk = insertedPlayerIds.slice(i, i + DEFAULT_BATCH_CHUNK_SIZE);
      const outcome = await this.lastingInjuries.syncLastingInjuryHistory(
        { playerIds: chunk },
        errors,
      );
      // A failed call has already pushed its own ImportError onto `errors`.
      // `imported` counts players whose history really was manufactured —
      // most players need nothing, and that is the normal, healthy case.
      imported += outcome?.backfilledPlayerIds.length ?? 0;
    }

    return { result: this.importResults.result({ imported, errors }) };
  }
}
