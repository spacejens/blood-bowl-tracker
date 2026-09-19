import type { TableCell } from '@blood-bowl-tracker/review-harness';
import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type {
  TpRawGainedSkill,
  TpRawPlayerAdvancements,
  TpRawPlayerSkill,
} from '../source/tp-raw-player-skills-index.service';
import { TpRawPlayerSkillsIndexService } from '../source/tp-raw-player-skills-index.service';

/**
 * What TP's roster files say about a player's skills and advancements.
 *
 * TP is the only source that records HOW a gained skill was gained
 * (`isRandom`) and whether it is elite, so those markers appear here. A
 * gained skill whose entry carried no `isRandom` at all shows no dice marker
 * and is called out in a note — absent is not the same as "chosen", and is
 * never guessed at.
 *
 * The characteristic figures are DERIVED (current versus the entry's position
 * template, AG/PA counted downwards because a roll target improves by
 * falling) and labelled as such: TP publishes no advancement counter, and an
 * injury and an advancement on the same characteristic cancel out in this
 * diff. They are shown for orientation only and are never compared against
 * the stored counts.
 */
@Injectable()
export class TpPlayerAdvancementsRawRendererService {
  constructor(
    private readonly index: TpRawPlayerSkillsIndexService,
    private readonly skillFormat: SkillFormatService,
    private readonly html: HtmlService,
  ) {}

  async render(externalId: string): Promise<string> {
    const advancements = await this.index.advancementsFor(externalId);
    if (advancements === null) {
      return this.html.note(
        `No TP roster entry for line-up id ${externalId} in the downloaded files.`,
      );
    }
    if (!advancements.hasTemplate) {
      return (
        this.html.note(
          'TP published no position template for this player, so starting skills and derived increases are unavailable.',
        ) + this.skillsSection(advancements)
      );
    }
    return (
      this.skillsSection(advancements) + this.increasesSection(advancements)
    );
  }

  private skillsSection(advancements: TpRawPlayerAdvancements): string {
    const rows: TableCell[][] = [
      ...advancements.startingSkills.map((skill) => [
        this.skillFormat.format({
          name: this.name(skill),
          attributeValue: skill.attributeValue,
        }),
        'starting',
      ]),
      ...advancements.gainedSkills.map((skill) => [
        this.skillFormat.format({
          name: this.name(skill),
          attributeValue: skill.attributeValue,
          isRandom: skill.isRandom === true,
          isElite: skill.isElite,
        }),
        'gained',
      ]),
    ];
    const unknownRandom = advancements.gainedSkills.some(
      (skill) => skill.isRandom === null,
    );
    return (
      this.html.subheading('Skills') +
      this.html.table(['Skill', 'Source'], rows) +
      (unknownRandom
        ? this.html.note(
            'TP recorded no random/chosen flag for this skill, so no dice marker is shown for it.',
          )
        : '')
    );
  }

  private increasesSection(advancements: TpRawPlayerAdvancements): string {
    const { move, strength, agility, passing, armour } =
      advancements.characteristicDiffs;
    return (
      this.html.subheading('Characteristic improvements') +
      this.html.table(
        ['MA', 'ST', 'AG', 'PA', 'AV'],
        [
          [move, strength, agility, passing, armour].map((value) =>
            String(value),
          ),
        ],
      ) +
      this.html.note(
        'Derived from the position template, not reported by TP: an injury and an advancement on the same characteristic cancel out here.',
      )
    );
  }

  private name(skill: TpRawPlayerSkill | TpRawGainedSkill): string {
    return skill.name ?? `skill master #${skill.skillMasterId}`;
  }
}
