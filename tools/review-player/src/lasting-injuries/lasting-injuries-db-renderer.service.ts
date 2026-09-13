import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, players } from '@blood-bowl-tracker/db';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import type { SampledPlayer } from '../shared/review.types';

const HEADERS = [
  'Miss next game',
  'Niggling',
  'MA',
  'ST',
  'AG',
  'PA',
  'AV',
] as const;

/**
 * The six stored lasting-injury columns, shown as stored. No comparison and
 * no derivation: the raw panel beside this one carries what each source said,
 * and the reviewer's job is to decide whether the two agree.
 *
 * A row whose values are all at their defaults is labelled as such rather than
 * highlighted — "no lasting injury" is the overwhelmingly common and entirely
 * correct state, not a finding. A row with any non-default value is
 * highlighted, so the handful of players worth actually reading stand out in a
 * long report.
 *
 * `HtmlService` is injected real in this service's spec — it is a pure
 * formatter with its own tests, and mocking it would leave the markup
 * unasserted.
 */
@Injectable()
export class LastingInjuriesDbRendererService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly html: HtmlService,
  ) {}

  async render(player: SampledPlayer): Promise<string> {
    const rows = await this.db
      .select({
        missNextGame: players.missNextGame,
        nigglingInjuryCount: players.nigglingInjuryCount,
        moveReductionCount: players.moveReductionCount,
        strengthReductionCount: players.strengthReductionCount,
        agilityReductionCount: players.agilityReductionCount,
        passingReductionCount: players.passingReductionCount,
        armourReductionCount: players.armourReductionCount,
      })
      .from(players)
      .where(eq(players.id, player.playerId));
    const stored = rows[0];
    if (stored === undefined) {
      return this.html.note(
        `No player row with id ${player.playerId} in the database.`,
      );
    }

    const cells = [
      String(stored.missNextGame),
      String(stored.nigglingInjuryCount),
      String(stored.moveReductionCount),
      String(stored.strengthReductionCount),
      String(stored.agilityReductionCount),
      String(stored.passingReductionCount),
      String(stored.armourReductionCount),
    ];
    const injured =
      stored.missNextGame ||
      stored.nigglingInjuryCount > 0 ||
      stored.moveReductionCount > 0 ||
      stored.strengthReductionCount > 0 ||
      stored.agilityReductionCount > 0 ||
      stored.passingReductionCount > 0 ||
      stored.armourReductionCount > 0;

    return this.html.table(
      ['Row', ...HEADERS],
      [
        injured
          ? this.html.highlight(['Stored (injured)', ...cells])
          : ['Stored (no lasting injury)', ...cells],
      ],
    );
  }
}
