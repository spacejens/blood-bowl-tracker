import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, eras, players, sql, teamEras } from '@blood-bowl-tracker/db';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import type { SampledPlayer } from '../shared/review.types';

/** How a NULL `players.status` reads: not reported, which is not "active". */
const UNKNOWN = 'unknown (no source reported a status)';

/**
 * The stored `players.status`, shown as stored. NULL means no source reported
 * a status and is shown as unknown, never as active.
 *
 * An active player whose era has ended gets a note naming the era and its end
 * date: such a player was active until the era closed, which a reviewer
 * should read differently from one still playing. "Ended" is decided in SQL —
 * `end_date` non-null and before `current_date` — the same definition the
 * status strata use, so no clock is read here.
 *
 * `HtmlService` is injected real in this service's spec — it is a pure
 * formatter with its own tests, and mocking it would leave the markup
 * unasserted.
 */
@Injectable()
export class PlayerStatusDbRendererService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly html: HtmlService,
  ) {}

  async render(player: SampledPlayer): Promise<string> {
    const rows = await this.db
      .select({
        status: players.status,
        eraName: eras.name,
        eraEndDate: eras.endDate,
        eraEnded: sql<boolean>`(${eras.endDate} is not null and ${eras.endDate} < current_date)`,
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(players.id, player.playerId));
    const stored = rows[0];
    if (stored === undefined) {
      return this.html.note(
        `No player row with id ${player.playerId} in the database.`,
      );
    }
    const table = this.html.table(
      ['Stored status'],
      [[stored.status ?? UNKNOWN]],
    );
    if (stored.status !== 'active' || !stored.eraEnded) {
      return table;
    }
    return (
      table +
      this.html.note(
        `active until the end of the era: ${stored.eraName} ended ` +
          `${stored.eraEndDate ?? ''}.`,
      )
    );
  }
}
