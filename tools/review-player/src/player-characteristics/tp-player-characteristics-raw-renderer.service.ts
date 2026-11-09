import { PLAYER_CHARACTERISTICS } from '@blood-bowl-tracker/domain-enums';
import {
  HtmlService,
  NO_CHARACTERISTIC,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';

/** The characteristics table's header cells, in column order. */
const HEADERS = ['Row', ...PLAYER_CHARACTERISTICS] as const;

/**
 * What the TP raw index says a player's MA/ST/AG/PA/AV are, read from the
 * downloaded roster files, under the position template they were recruited
 * from. TP reports nothing about a reduced characteristic and publishes no
 * advancement counter, so the gap between the two rows is left for the
 * reviewer to read: deciding which direction of a gap is a reduction is
 * exactly the judgement the importer makes.
 *
 * Only a null value renders as the report's none marker; a zero (e.g. a
 * Kroxigor/Ogre's Passing) is a real characteristic value and prints like any
 * other number, since this renderer shows raw TP data with no
 * `CharacteristicFormat` context to special-case it against.
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
    const template = [
      aggregate.templateMove,
      aggregate.templateStrength,
      aggregate.templateAgility,
      aggregate.templatePassing,
      aggregate.templateArmour,
    ];
    const current = [
      aggregate.move,
      aggregate.strength,
      aggregate.agility,
      aggregate.passing,
      aggregate.armour,
    ];
    if ([...template, ...current].every((value) => value === null)) {
      return this.html.note(
        `No characteristics for line-up id ${externalId} in any downloaded ` +
          'TP roster file.',
      );
    }
    return this.html.table(
      [...HEADERS],
      [
        ['Position template', ...template.map((value) => this.display(value))],
        ['Player', ...current.map((value) => this.display(value))],
      ],
    );
  }

  /**
   * A null value becomes the none marker; every other value, including a
   * real zero, is shown as a string.
   */
  private display(value: number | null): string {
    return value === null ? NO_CHARACTERISTIC : String(value);
  }
}
