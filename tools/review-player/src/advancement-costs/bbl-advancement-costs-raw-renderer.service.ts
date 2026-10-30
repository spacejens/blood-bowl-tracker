import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import type { BblRawPlayerAdvancements } from '../source/bbl-player-skills-cell.service';
import { BblUnspentSppReaderService } from '../source/bbl-unspent-spp-reader.service';

const NONE = '—';

/**
 * BBL's own view of a player's SPP spending: both figures of the page's
 * "Unspent SPP" row (the reported figure, which can be negative, and the
 * career total in brackets), the gained skills in page order and the
 * `+MA`/`+ST`/`+AG`/`+PA`/`+AV` counts — all read through the same `source/`
 * services the imported panel compares against. BBL records nothing about
 * how a skill was gained, which the panel says in words.
 */
@Injectable()
export class BblAdvancementCostsRawRendererService {
  constructor(
    private readonly unspent: BblUnspentSppReaderService,
    private readonly advancements: BblPlayerAdvancementsReaderService,
    private readonly html: HtmlService,
  ) {}

  async render(externalId: string): Promise<string> {
    const figures = await this.unspent.read(externalId);
    if (figures === null) {
      return this.html.note(
        `No BBL player page for pid ${externalId} in the downloaded mirror.`,
      );
    }
    const advancements = await this.advancements.read(externalId);
    return (
      this.html.subheading('Unspent SPP row') +
      this.html.table(
        ['Field', 'Value'],
        [
          ['Unspent SPP (reported)', this.value(figures.unspent)],
          ['Career SPP (in brackets)', this.value(figures.careerTotal)],
        ],
      ) +
      (advancements === null
        ? this.html.note('The page has no Skills cell.')
        : this.advancementTables(advancements)) +
      this.html.note(
        'BBL cannot say whether a gained skill was randomly rolled or freely chosen, so nothing here narrows a skill to a random or a chosen cost.',
      )
    );
  }

  private advancementTables(advancements: BblRawPlayerAdvancements): string {
    const gained = advancements.skills.filter(
      (skill) => skill.source === 'gained',
    );
    const counts = advancements.increaseCounts;
    return (
      this.html.subheading('Gained skills (page order)') +
      this.html.table(
        ['#', 'Skill'],
        gained.map((skill) => [
          String(skill.advancementOrder),
          skill.attributeValue === null
            ? skill.name
            : `${skill.name} (${skill.attributeValue})`,
        ]),
      ) +
      this.html.subheading('Characteristic increases') +
      this.html.table(
        ['MA', 'ST', 'AG', 'PA', 'AV'],
        [
          [
            counts.move,
            counts.strength,
            counts.agility,
            counts.passing,
            counts.armour,
          ].map(String),
        ],
      )
    );
  }

  private value(figure: number | null): string {
    return figure === null ? NONE : String(figure);
  }
}
