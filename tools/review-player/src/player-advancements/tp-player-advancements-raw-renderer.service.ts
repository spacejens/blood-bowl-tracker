import type { TableCell } from '@blood-bowl-tracker/review-harness';
import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type {
  TpRawPlayerAdvancements,
  TpRawPlayerSkill,
} from '../source/tp-raw-player-skills-index.service';
import { TpRawPlayerSkillsIndexService } from '../source/tp-raw-player-skills-index.service';

const NONE = '—';
const NOT_RECORDED = 'not recorded';

const EXTRA_CAVEAT =
  'Extra skills (isExtra, such as Hatred) are imported as free extras, so the modelled range prices them at 0.';
const LONER_CAVEAT =
  "A Journeyman's Loner is granted without SPP being spent; the modelled range does not recognise it and prices it as an advancement, so such a player can legitimately be listed.";

/**
 * What TP's roster files say about a player's SPP and advancements: the
 * roster entry's `totalStarPlayerPoints`, `starPlayerPoints` (what TP holds
 * unspent) and `pendingImprovements`, verbatim; one table of the position
 * template's skills as starting and the entry's own skills as gained, each
 * gained skill with TP's `isRandom`, `isElite` and `isExtra` (a missing
 * `isRandom` reads "not recorded" — absent is not "chosen" and is never
 * guessed at); and the characteristic improvements derived from the current
 * stat line against the template.
 *
 * The derived improvements count AG/PA downwards, because a roll target
 * improves by falling. TP publishes no advancement counter, and an injury and
 * an advancement on the same characteristic cancel out in the difference,
 * so it is shown for orientation only and never compared.
 *
 * A player with an extra skill or a gained Loner gets a line on how the
 * modelled range prices it, since either can legitimately put the player in
 * the unspent-SPP stratum.
 */
@Injectable()
export class TpPlayerAdvancementsRawRendererService {
  constructor(
    private readonly index: TpRawPlayerSkillsIndexService,
    private readonly skillFormat: SkillFormatService,
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
    return (
      this.html.subheading('SPP figures') +
      this.html.table(
        ['Field', 'Value'],
        [
          ['totalStarPlayerPoints', this.value(figures.totalStarPlayerPoints)],
          ['starPlayerPoints (unspent)', this.value(figures.starPlayerPoints)],
          ['pendingImprovements', this.value(figures.pendingImprovements)],
        ],
      ) +
      this.skillsSection(advancements) +
      this.improvementsSection(advancements)
    );
  }

  private skillsSection(advancements: TpRawPlayerAdvancements): string {
    const rows: TableCell[][] = [
      ...advancements.startingSkills.map((skill) => [
        this.name(skill),
        'starting',
        NONE,
        NONE,
        NONE,
      ]),
      ...advancements.gainedSkills.map((skill) => [
        this.name(skill),
        'gained',
        skill.isRandom === null ? NOT_RECORDED : String(skill.isRandom),
        String(skill.isElite),
        skill.isExtra === undefined ? NONE : String(skill.isExtra),
      ]),
    ];
    return (
      this.html.subheading('Skills and advancements') +
      (advancements.hasTemplate
        ? ''
        : this.html.note(
            'TP published no position template for this player, so starting skills and derived increases are unavailable.',
          )) +
      this.html.table(
        ['Skill', 'Source', 'isRandom', 'isElite', 'isExtra'],
        rows,
      ) +
      this.caveats(advancements)
    );
  }

  /** The pricing lines that apply to this player's gained skills, if any. */
  private caveats(advancements: TpRawPlayerAdvancements): string {
    const gained = advancements.gainedSkills;
    return [
      gained.some((skill) => skill.isExtra === true) ? EXTRA_CAVEAT : null,
      gained.some((skill) => skill.name === 'Loner') ? LONER_CAVEAT : null,
    ]
      .filter((text): text is string => text !== null)
      .map((text) => `<p>${this.html.escape(text)}</p>`)
      .join('');
  }

  private improvementsSection(advancements: TpRawPlayerAdvancements): string {
    if (!advancements.hasTemplate) {
      return '';
    }
    const { move, strength, agility, passing, armour } =
      advancements.characteristicDiffs;
    return (
      this.html.subheading(
        'Characteristic improvements (derived from position template)',
      ) +
      this.html.table(
        ['MA', 'ST', 'AG', 'PA', 'AV'],
        [
          [move, strength, agility, passing, armour].map((value) =>
            String(value),
          ),
        ],
      )
    );
  }

  private name(skill: TpRawPlayerSkill): string {
    return this.skillFormat.format({
      name: skill.name ?? `skill master #${skill.skillMasterId}`,
      attributeValue: skill.attributeValue,
    });
  }

  private value(figure: number | null): string {
    return figure === null ? NONE : String(figure);
  }
}
