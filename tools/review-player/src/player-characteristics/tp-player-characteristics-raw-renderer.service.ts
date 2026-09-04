import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';
import { NO_CHARACTERISTIC } from './characteristic-format.service';

/** The characteristics table's header cells, in column order. */
const HEADERS = ['MA', 'ST', 'AG', 'PA', 'AV'] as const;

/**
 * What the TP raw index says a player's MA/ST/AG/PA/AV are, read from the
 * downloaded roster files. A null value or a zero both render as the report's
 * none marker, since zero is never a real characteristic value (and TP reports
 * null for a characteristic the position doesn't have).
 *
 * Two distinct gaps get two distinct notes, because they mean different
 * things: a line-up id in no match file at all is a player this tool cannot
 * see, while a line-up id with no roster entry is a player TP publishes no
 * characteristics for (roster files cover fewer competitions than match files
 * do). Neither is an error.
 *
 * `HtmlService` is injected real in this service's spec — it is a pure
 * formatter with its own tests, and mocking it would leave the markup
 * unasserted.
 */
@Injectable()
export class TpPlayerCharacteristicsRawRendererService {
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
    const values = [
      aggregate.move,
      aggregate.strength,
      aggregate.agility,
      aggregate.passing,
      aggregate.armour,
    ];
    if (values.every((value) => value === null)) {
      return this.html.note(
        `No characteristics for line-up id ${externalId} in any downloaded ` +
          'TP roster file.',
      );
    }
    const cells = values.map((value) => this.display(value));
    return this.html.table([...HEADERS], [cells]);
  }

  /**
   * A null value and a zero both become the none marker; every other value is
   * shown as a string.
   */
  private display(value: number | null): string {
    return value === null || value === 0 ? NO_CHARACTERISTIC : String(value);
  }
}
