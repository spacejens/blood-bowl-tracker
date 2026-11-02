import type { TableCell } from '@blood-bowl-tracker/review-harness';
import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import type { BblRawPlayerAdvancements } from '../source/bbl-player-skills-cell.service';
import { BblUnspentSppReaderService } from '../source/bbl-unspent-spp-reader.service';

const NONE = '—';

/**
 * What BBL's own player page says about a player's SPP and advancements:
 * both figures of the page's "Unspent SPP" row (the career total in
 * brackets, and the reported unspent figure, which can be negative), then one
 * list of the Skills cell — starting skills first, then gained skills and
 * `+MA`/`+ST`/`+AG`/`+PA`/`+AV` increases in the page's own advancement
 * numbering. Everything is read through the same `source/` services the
 * imported panel compares against.
 *
 * BBL records only plain text (starting) versus a coloured span (gained); it
 * cannot tell a rolled skill from a chosen one and has no elite concept, so no
 * skill here carries the dice or diamond marker, and the imported panel's
 * markers for a BBL player are not a disagreement with this list.
 *
 * `HtmlService` and `SkillFormatService` are injected real in this service's
 * spec: both are pure formatters with their own tests.
 */
@Injectable()
export class BblPlayerAdvancementsRawRendererService {
  constructor(
    private readonly unspent: BblUnspentSppReaderService,
    private readonly reader: BblPlayerAdvancementsReaderService,
    private readonly skillFormat: SkillFormatService,
    private readonly html: HtmlService,
  ) {}

  async render(externalId: string): Promise<string> {
    const figures = await this.unspent.read(externalId);
    if (figures === null) {
      return this.html.note(
        `No BBL player page for pid ${externalId} in the downloaded mirror.`,
      );
    }
    const advancements = await this.reader.read(externalId);
    return (
      this.html.subheading('SPP figures') +
      this.html.table(
        ['Field', 'Value'],
        [
          ['Career SPP (in brackets)', this.value(figures.careerTotal)],
          ['Unspent SPP (reported)', this.value(figures.unspent)],
        ],
      ) +
      this.html.subheading('Skills and advancements') +
      (advancements === null
        ? this.html.note('The page has no Skills cell.')
        : this.html.table(
            ['Order', 'Advancement', 'Source'],
            this.rows(advancements),
          ))
    );
  }

  /** Starting skills carry no order and lead; the rest follow page numbering. */
  private rows(advancements: BblRawPlayerAdvancements): TableCell[][] {
    const entries = [
      ...advancements.skills.map((skill) => ({
        order: skill.advancementOrder,
        advancement: this.skillFormat.format({
          name: skill.name,
          attributeValue: skill.attributeValue,
        }),
        source: skill.source,
      })),
      ...advancements.increases.map((increase) => ({
        order: increase.advancementOrder,
        advancement: `+${increase.characteristic}`,
        source: 'characteristic increase',
      })),
    ];
    return entries
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(({ order, advancement, source }) => [
        order === null ? NONE : `#${order}`,
        advancement,
        source,
      ]);
  }

  private value(figure: number | null): string {
    return figure === null ? NONE : String(figure);
  }
}
