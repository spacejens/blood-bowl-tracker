import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { TpRawPlayerSkillsIndexService } from '../source/tp-raw-player-skills-index.service';

const NONE = '—';

/**
 * TP's own view of a player's SPP: the roster entry's `totalStarPlayerPoints`,
 * `starPlayerPoints` and `pendingImprovements`, verbatim, and each gained
 * skill's `isRandom` / `isElite` / `isExtra`, from the same roster snapshot.
 * TP's download carries no per-advancement SPP cost, which the panel says in
 * words. A gained skill with no `isRandom` flag is shown as not recorded,
 * never as chosen.
 */
@Injectable()
export class TpAdvancementCostsRawRendererService {
  constructor(
    private readonly index: TpRawPlayerSkillsIndexService,
    private readonly html: HtmlService,
  ) {}

  async render(externalId: string): Promise<string> {
    const figures = await this.index.sppFiguresFor(externalId);
    const advancements = await this.index.advancementsFor(externalId);
    if (figures === null || advancements === null) {
      return this.html.note(
        `No downloaded TP roster file carries line-up ${externalId}.`,
      );
    }
    const unknownRandom = advancements.gainedSkills.some(
      (skill) => skill.isRandom === null,
    );
    return (
      this.html.subheading('Roster file SPP fields') +
      this.html.table(
        ['Field', 'Value'],
        [
          ['totalStarPlayerPoints', this.value(figures.totalStarPlayerPoints)],
          ['starPlayerPoints', this.value(figures.starPlayerPoints)],
          ['pendingImprovements', this.value(figures.pendingImprovements)],
        ],
      ) +
      this.html.note(
        'starPlayerPoints is the SPP TP holds unspent: totalStarPlayerPoints less what its advancements cost.',
      ) +
      this.html.subheading('Gained skills') +
      this.html.table(
        ['Skill', 'isRandom', 'isElite', 'isExtra'],
        advancements.gainedSkills.map((skill) => [
          skill.name ?? `skillMasterId ${skill.skillMasterId}`,
          skill.isRandom === null ? 'not recorded' : String(skill.isRandom),
          String(skill.isElite),
          skill.isExtra === undefined ? NONE : String(skill.isExtra),
        ]),
      ) +
      (unknownRandom
        ? this.html.note(
            "Skills marked not recorded had no random/chosen flag in TP's data; that is not the same as chosen.",
          )
        : '') +
      this.html.note(
        "Extra skills (isExtra, such as Hatred) are imported as free extras, so the modelled range prices them at 0. A Journeyman's Loner is also granted without SPP being spent; the modelled range does not recognise it and prices it as an advancement, so such a player can legitimately be listed.",
      ) +
      this.html.note(
        "TP's download carries no per-advancement SPP cost, so nothing here prices an advancement.",
      )
    );
  }

  private value(figure: number | null): string {
    return figure === null ? NONE : String(figure);
  }
}
