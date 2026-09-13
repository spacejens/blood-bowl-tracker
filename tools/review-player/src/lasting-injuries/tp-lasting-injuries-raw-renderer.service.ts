import {
  HtmlService,
  NO_CHARACTERISTIC,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { TpRawPlayerAggregate } from '../source/tp-raw-player-index.service';
import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';

/** The current-vs-template comparison table's columns. */
const HEADERS = ['Row', 'MA', 'ST', 'AG', 'PA', 'AV'] as const;

/**
 * What TP's raw roster data says about a player's outstanding injuries.
 *
 * TP reports two of the three kinds outright — `nigglingInjuries` and
 * `canPlayNextGame` — and those are shown verbatim. It reports nothing at all
 * about a currently-reduced characteristic, so the panel instead shows the two
 * lines a reduction would show up between: the player's current
 * MA/ST/AG/PA/AV and their position template's. The gap is left for the
 * reviewer to read. That is deliberate: deciding which direction of a gap is a
 * reduction is exactly the judgement the importer makes, and a review panel
 * that made the same judgement could only ever agree with it.
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
    if (
      aggregate.nigglingInjuries === null &&
      aggregate.canPlayNextGame === null
    ) {
      return this.html.note(
        `No lasting-injury data for line-up id ${externalId} in any ` +
          'downloaded TP roster file.',
      );
    }
    return [
      this.html.table(
        ['nigglingInjuries', 'canPlayNextGame'],
        [
          [
            this.display(aggregate.nigglingInjuries),
            this.display(aggregate.canPlayNextGame),
          ],
        ],
      ),
      this.html.subheading('Current vs. position template'),
      this.html.table(
        [...HEADERS],
        [
          ['Template', ...this.templateValues(aggregate)],
          ['Player', ...this.currentValues(aggregate)],
        ],
      ),
    ].join('');
  }

  private templateValues(aggregate: TpRawPlayerAggregate): string[] {
    return [
      aggregate.templateMove,
      aggregate.templateStrength,
      aggregate.templateAgility,
      aggregate.templatePassing,
      aggregate.templateArmour,
    ].map((value) => this.display(value));
  }

  private currentValues(aggregate: TpRawPlayerAggregate): string[] {
    return [
      aggregate.move,
      aggregate.strength,
      aggregate.agility,
      aggregate.passing,
      aggregate.armour,
    ].map((value) => this.display(value));
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
