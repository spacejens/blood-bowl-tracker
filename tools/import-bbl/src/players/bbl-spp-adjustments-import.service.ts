import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  DEFAULT_BATCH_CHUNK_SIZE,
  ImportResultService,
  SppAdjustmentsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/** The SPP figures one BBL player page shows, from its "Unspent SPP" row. */
export interface BblScrapedSpp {
  scrapedTotal: number | null;
  reportedUnspentSpp: number | null;
}

/**
 * Reconciles `players.spp_adjustment` and `players.spp_total` for every
 * player this BBL run imported.
 *
 * BBL's site displays a career SPP total that was recalculated at BB2020
 * rates when the site re-platformed, so it is not stored verbatim. The
 * server compares it against a forced-rate replay of the player's events to
 * recover the unexplained remainder as `spp_adjustment`, then rebuilds
 * `spp_total` as `era-correct event sum + spp_adjustment`. A player whose
 * page had no total is still sent (with `null`), so their `spp_total` is
 * refreshed and their adjustment stays NULL rather than going stale.
 *
 * Must run after the match-events step, since it depends on
 * `match_events.spp_value` already being populated. Idempotent: the server
 * writes absolute values on every run.
 *
 * BBL's unspent figure goes along when the page has one; the server stores it
 * only under rules sets that price by kind, and only when it fits the
 * bracketed total from the same row. It is left out for a player whose skills
 * were not all written (`incompletePlayerIds`): the server settles a skill's
 * source from that figure against the stored skills, and an incomplete history
 * could make a wrong source fit. The player's total still goes along, and the
 * figure returns on the next run that writes every skill.
 */
@Injectable()
export class BblSppAdjustmentsImportService {
  constructor(
    private readonly sppAdjustments: SppAdjustmentsImportService,
    private readonly importResults: ImportResultService,
  ) {}

  async importSppAdjustments(
    scrapedSppByPlayerId: Map<number, BblScrapedSpp>,
    incompletePlayerIds: ReadonlySet<number> = new Set(),
  ): Promise<{ result: ImportResult }> {
    const errors: ImportError[] = [];
    let imported = 0;

    const entries = [...scrapedSppByPlayerId].map(
      ([playerId, { scrapedTotal, reportedUnspentSpp }]) => ({
        playerId,
        scrapedTotal,
        ...(reportedUnspentSpp === null || incompletePlayerIds.has(playerId)
          ? {}
          : { reportedUnspentSpp }),
      }),
    );

    // Chunk rather than sending every player in one RPC call: an unbounded
    // payload risks Postgres's bind-parameter limit as the league grows, and
    // it makes one transport hiccup cost the entire step. Each chunk is an
    // independent call, so a failure in one doesn't stop the others.
    for (let i = 0; i < entries.length; i += DEFAULT_BATCH_CHUNK_SIZE) {
      const chunk = entries.slice(i, i + DEFAULT_BATCH_CHUNK_SIZE);
      const outcome = await this.sppAdjustments.syncScrapedSppAdjustments(
        { players: chunk },
        errors,
      );
      // A failed call has already pushed its own ImportError onto `errors`.
      imported += outcome?.updatedPlayerIds.length ?? 0;
    }

    return { result: this.importResults.result({ imported, errors }) };
  }
}
