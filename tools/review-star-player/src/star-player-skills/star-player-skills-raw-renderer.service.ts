import type { TableCell } from '@blood-bowl-tracker/review-harness';
import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarSourceLookupService } from '../shared/star-source-lookup.service';
import type { TpRawStarPlayerEntry } from '../source/tp-raw-star-player-index.service';
import { TpSkillMasterNamesService } from '../source/tp-skill-master-names.service';

/** What a cell shows for a star the source gives no starting skills for. */
const NO_SKILLS = 'none';

/**
 * The star-skills raw panel: each source's own view of this star's starting
 * skills.
 *
 * BBL's page carries a single, rules-set-less Skills cell. TP publishes one
 * entry per rules set its official lists carry the star in, naming skills by
 * `skillMasterId` (resolved through `TpSkillMasterNamesService`, shown as
 * `skill master #<id>` when no downloaded roster file explains it), plus the
 * star's own exclusive skill as a sibling `specialRuleName` — which is merged
 * in here as the unique-marked skill it is, since that is exactly how the
 * importer records it.
 *
 * No skill here carries the random or elite marker: both are advancement-only
 * concepts and never apply to a starting skill.
 *
 * `HtmlService` and `SkillFormatService` are injected real in this service's
 * spec: both are pure formatters with their own tests, and mocking either
 * would leave the markup unasserted.
 */
@Injectable()
export class StarPlayerSkillsRawRendererService {
  constructor(
    private readonly lookup: StarSourceLookupService,
    private readonly masters: TpSkillMasterNamesService,
    private readonly skillFormat: SkillFormatService,
    private readonly html: HtmlService,
  ) {}

  async render(star: SampledStarPlayer): Promise<string> {
    return [await this.bblSection(star), await this.tpSection(star)].join('\n');
  }

  private async bblSection(star: SampledStarPlayer): Promise<string> {
    const found = await this.lookup.bblStarFor(star);
    const row =
      found.star === null
        ? this.html.highlight([found.notFoundNote])
        : [
            this.join(
              found.star.skillRefs.map((skill) =>
                this.skillFormat.format({
                  name: skill.name,
                  attributeValue: skill.attributeValue,
                }),
              ),
            ),
          ];
    return (
      this.html.subheading('BBL') + this.html.table(['Starting skills'], [row])
    );
  }

  private async tpSection(star: SampledStarPlayer): Promise<string> {
    const lookup = await this.lookup.tpStarsFor(star);
    if (lookup.stars.length === 0) {
      return (
        this.html.subheading('TP') +
        this.html.table(
          ['Rules set', 'Starting skills'],
          [this.html.highlight([lookup.notFoundNote, NO_SKILLS])],
        )
      );
    }
    const rows: TableCell[][] = [];
    for (const tpStar of lookup.stars) {
      for (const entry of tpStar.entries) {
        rows.push([entry.rulesSet, this.join(await this.entrySkills(entry))]);
      }
    }
    return (
      this.html.subheading('TP') +
      this.html.table(['Rules set', 'Starting skills'], rows)
    );
  }

  /** One entry's skills, with its exclusive skill merged in first. */
  private async entrySkills(entry: TpRawStarPlayerEntry): Promise<string[]> {
    const skills: string[] = [];
    if (entry.specialRuleName !== null) {
      skills.push(
        this.skillFormat.format({
          name: entry.specialRuleName,
          isUnique: true,
        }),
      );
    }
    for (const ref of entry.skills) {
      const master = await this.masters.masterFor(ref.skillMasterId);
      skills.push(
        this.skillFormat.format({
          name: master?.name ?? `skill master #${ref.skillMasterId}`,
          attributeValue: ref.attributeValue,
        }),
      );
    }
    return skills;
  }

  private join(skills: readonly string[]): string {
    return skills.length === 0 ? NO_SKILLS : skills.join(', ');
  }
}
