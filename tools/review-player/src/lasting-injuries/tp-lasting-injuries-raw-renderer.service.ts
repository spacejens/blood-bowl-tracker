import {
  HtmlService,
  NO_CHARACTERISTIC,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';

/**
 * What TP's raw roster data says about a player's outstanding injuries:
 * `nigglingInjuries` and `canPlayNextGame`, verbatim. TP reports nothing about
 * a currently-reduced characteristic; the career history's characteristics
 * part shows the current stat line under the position template, where such a
 * reduction shows up.
 *
 * Two distinct gaps get two distinct notes, matching the characteristics
 * renderer: a line-up id in no match file at all is a player this tool cannot
 * see, while one with no roster entry is a player TP publishes no live state
 * for (roster files cover fewer competitions than match files do).
 *
 * `HtmlService` is injected real in this service's spec — it is a pure
 * formatter with its own tests, and mocking it would leave the markup
 * unasserted.
 */
@Injectable()
export class TpLastingInjuriesRawRendererService {
  constructor(
    private readonly index: TpRawPlayerIndexService,
    private readonly html: HtmlService,
  ) {}

  async render(externalId: string): Promise<string> {
    const aggregate = await this.index.aggregateFor(externalId);
    if (aggregate === null) {
      return this.html.note(
        `Line-up id ${externalId} appears in no downloaded TP match file.`,
      );
    }
    const hasLastingInjuryData =
      aggregate.nigglingInjuries !== null || aggregate.canPlayNextGame !== null;
    if (!hasLastingInjuryData) {
      return this.html.note(
        `No lasting-injury data for line-up id ${externalId} in any ` +
          'downloaded TP roster file.',
      );
    }
    return this.html.table(
      ['nigglingInjuries', 'canPlayNextGame'],
      [
        [
          this.display(aggregate.nigglingInjuries),
          this.display(aggregate.canPlayNextGame),
        ],
      ],
    );
  }

  /**
   * Only a null renders as the none marker; a real 0 or a real `false` prints
   * as itself, matching the characteristics renderer's convention that this
   * panel shows raw TP data with no rules-set context to special-case against.
   */
  private display(value: number | boolean | null): string {
    return value === null ? NO_CHARACTERISTIC : String(value);
  }
}
