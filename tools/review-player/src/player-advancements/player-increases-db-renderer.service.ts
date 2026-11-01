import type { Db } from '@blood-bowl-tracker/db';
import { and, asc, DB, eq, playerAdvancements } from '@blood-bowl-tracker/db';
import type { PlayerCharacteristic } from '@blood-bowl-tracker/domain-enums';
import type { TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';

const NONE = '—';
const NOT_IN_RAW = 'not in the raw source';
const RAW_ONLY = 'in the raw source only';
const HEADERS = ['Increase', 'Order', 'Confirmed'];

/** One stored characteristic row of `player_advancements`. */
interface StoredIncreaseRow {
  characteristic: PlayerCharacteristic;
  advancementOrder: number | null;
  orderConfirmed: boolean;
}

/**
 * The stored characteristic increases of one player, in stored order, and for
 * a BBL-sourced player a check of each against the markers on BBL's own page:
 * an increase matches a marker of the same characteristic at the same place
 * among the player's advancements, which checks both how many increases were
 * stored and where they sit. A stored increase with no matching marker, and a
 * marker with no stored increase, are highlighted and say so in words.
 *
 * TP publishes no increase markers, so a TP-sourced player's rows are listed
 * without any comparison. Rows flagged `removed` are not live increases and
 * are left out.
 */
@Injectable()
export class PlayerIncreasesDbRendererService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly bbl: BblPlayerAdvancementsReaderService,
    private readonly html: HtmlService,
  ) {}

  async render(player: SampledPlayer): Promise<string> {
    const stored = await this.stored(player.playerId);
    const cells = (row: StoredIncreaseRow): string[] => [
      `+${row.characteristic}`,
      row.advancementOrder === null ? NONE : String(row.advancementOrder),
      row.orderConfirmed ? 'yes' : 'no',
    ];
    if (player.source !== 'bbl') {
      return (
        this.html.table(HEADERS, stored.map(cells)) +
        this.html.note(
          'TP publishes no increase markers, so nothing is compared here; the raw panel shows a derived template difference instead.',
        )
      );
    }
    const raw = await this.bbl.read(player.externalId);
    if (raw === null) {
      return this.html.table(HEADERS, stored.map(cells));
    }
    const key = (characteristic: string, order: number | null): string =>
      `${characteristic}|${order}`;
    const unmatched = new Map<string, number>();
    for (const marker of raw.increases) {
      const k = key(marker.characteristic, marker.advancementOrder);
      unmatched.set(k, (unmatched.get(k) ?? 0) + 1);
    }
    const rows: TableRow[] = stored.map((row) => {
      const k = key(row.characteristic, row.advancementOrder);
      const remaining = unmatched.get(k) ?? 0;
      if (remaining > 0) {
        unmatched.set(k, remaining - 1);
        return [...cells(row), 'yes'];
      }
      return this.html.highlight([...cells(row), NOT_IN_RAW], [3]);
    });
    for (const marker of raw.increases) {
      const k = key(marker.characteristic, marker.advancementOrder);
      const remaining = unmatched.get(k) ?? 0;
      if (remaining > 0) {
        unmatched.set(k, remaining - 1);
        rows.push(
          this.html.highlight(
            [
              `+${marker.characteristic}`,
              String(marker.advancementOrder),
              NONE,
              RAW_ONLY,
            ],
            [3],
          ),
        );
      }
    }
    return this.html.table([...HEADERS, 'Raw source'], rows);
  }

  private async stored(playerId: number): Promise<StoredIncreaseRow[]> {
    const rows = await this.db
      .select({
        characteristic: playerAdvancements.characteristic,
        advancementOrder: playerAdvancements.advancementOrder,
        orderConfirmed: playerAdvancements.orderConfirmed,
      })
      .from(playerAdvancements)
      .where(
        and(
          eq(playerAdvancements.playerId, playerId),
          eq(playerAdvancements.source, 'characteristic'),
          eq(playerAdvancements.removed, false),
        ),
      )
      .orderBy(
        asc(playerAdvancements.advancementOrder),
        asc(playerAdvancements.characteristic),
        asc(playerAdvancements.id),
      );
    return rows.flatMap((row) =>
      row.characteristic === null
        ? []
        : [{ ...row, characteristic: row.characteristic }],
    );
  }
}
