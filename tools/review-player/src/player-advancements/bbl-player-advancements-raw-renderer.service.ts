import type { TableCell } from '@blood-bowl-tracker/review-harness';
import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import type { BblRawPlayerAdvancements } from '../source/bbl-player-skills-cell.service';

const NONE = '—';

/**
 * What BBL's own player page says about a player's skills and characteristic
 * increases.
 *
 * BBL records only plain-text (starting) versus coloured (gained); it cannot
 * distinguish a randomly rolled advancement from a freely chosen one, and it
 * has no elite concept at all. So no skill here ever carries the dice or
 * diamond marker, and the panel says so in words rather than showing an
 * "unverifiable" indicator per row — the imported panel's markers for a
 * BBL-sourced player are therefore not a disagreement with this one.
 *
 * `HtmlService` and `SkillFormatService` are injected real in this service's
 * spec: both are pure formatters with their own tests.
 */
@Injectable()
export class BblPlayerAdvancementsRawRendererService {
  constructor(
    private readonly reader: BblPlayerAdvancementsReaderService,
    private readonly skillFormat: SkillFormatService,
    private readonly html: HtmlService,
  ) {}

  async render(externalId: string): Promise<string> {
    const advancements = await this.reader.read(externalId);
    if (advancements === null) {
      return this.html.note(
        `No BBL player page, or no skills line on it, for pid ${externalId} in the downloaded mirror.`,
      );
    }
    return (
      this.html.subheading('Skills') +
      this.skillsTable(advancements) +
      this.html.note(
        'BBL does not record how a skill was gained, so no random or elite marker can be shown here.',
      ) +
      this.html.subheading('Characteristic increases') +
      this.increasesTable(advancements)
    );
  }

  private skillsTable(advancements: BblRawPlayerAdvancements): string {
    const rows: TableCell[][] = advancements.skills.map((skill) => [
      this.skillFormat.format({
        name: skill.name,
        attributeValue: skill.attributeValue,
      }),
      skill.source,
      skill.advancementOrder === null ? NONE : String(skill.advancementOrder),
    ]);
    return this.html.table(['Skill', 'Source', 'Order'], rows);
  }

  private increasesTable(advancements: BblRawPlayerAdvancements): string {
    const { move, strength, agility, passing, armour } =
      advancements.increaseCounts;
    return this.html.table(
      ['MA', 'ST', 'AG', 'PA', 'AV'],
      [
        [move, strength, agility, passing, armour].map((count) =>
          String(count),
        ),
      ],
    );
  }
}
