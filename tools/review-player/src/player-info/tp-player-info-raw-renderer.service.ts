import { Injectable } from '@nestjs/common';

import type { TableCell } from '../shared/html.service';
import { HtmlService } from '../shared/html.service';
import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';
import { TpPlayerEventLabelsService } from './tp-player-event-labels.service';

const NONE = '—';

/**
 * Renders what TP's own match files say about a player. TP publishes no
 * per-player page, so both its reported career total (the player's line-up
 * entry in the most recent match they appear in) and an independently summed
 * total (every `starPoints` on events attributed to their line-up id) are
 * shown: the two disagreeing is itself a finding.
 */
@Injectable()
export class TpPlayerInfoRawRendererService {
  constructor(
    private readonly index: TpRawPlayerIndexService,
    private readonly labels: TpPlayerEventLabelsService,
    private readonly html: HtmlService,
  ) {}

  async render(externalId: string): Promise<string> {
    const player = await this.index.aggregateFor(externalId);
    if (player === null) {
      return this.html.note(
        `Line-up id ${externalId} appears in no downloaded TP match file.`,
      );
    }
    const rows: TableCell[][] = [
      ['Name', player.name],
      ['Position', player.position],
      [
        'Reported total SPP (TP)',
        player.totalStarPlayerPoints === null
          ? NONE
          : String(player.totalStarPlayerPoints),
      ],
      ['SPP summed from raw match events', String(player.starPointsFromEvents)],
      ['Matches appeared in', String(player.matchCount)],
      ...[...player.eventCounts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([code, count]): TableCell[] => [
          `Events: ${this.labels.describe(code)}`,
          String(count),
        ]),
    ];
    return this.html.table(['Field', 'Value'], rows);
  }
}
