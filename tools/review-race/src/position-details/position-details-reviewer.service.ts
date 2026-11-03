import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { PositionCharacteristicsDbRendererService } from '../position-characteristics/position-characteristics-db-renderer.service';
import { PositionCharacteristicsRawRendererService } from '../position-characteristics/position-characteristics-raw-renderer.service';
import { PositionKeywordsDbRendererService } from '../position-keywords/position-keywords-db-renderer.service';
import { PositionKeywordsRawRendererService } from '../position-keywords/position-keywords-raw-renderer.service';
import { PositionStartingSkillsDbRendererService } from '../position-starting-skills/position-starting-skills-db-renderer.service';
import { PositionStartingSkillsRawRendererService } from '../position-starting-skills/position-starting-skills-raw-renderer.service';
import type { RaceDataTypeReviewer } from '../shared/data-type-reviewer';
import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';
import { SectionRenderService } from '../shared/section-render.service';

/**
 * The position-details panel pair: what the race's positions are made of.
 * Each panel stacks characteristics, starting skills and keywords under their
 * own subheadings, each rendered by that aspect's own raw or database
 * renderer. Only TP publishes keywords, so the raw keywords heading names TP
 * and the curated catalogue rather than all three sources.
 *
 * The imported panel checks once whether the race has stored positions and
 * an era mapped to a rules set, and shows one note for the whole panel when
 * it has not, instead of each part repeating the same note. The renderers
 * keep their own copies of those checks so they stay correct on their own.
 */
@Injectable()
export class PositionDetailsReviewerService implements RaceDataTypeReviewer {
  readonly id = 'position-details';
  readonly rawPanelLabel = 'Raw sources (BBL / TP / manual curation)';
  readonly importedPanelLabel = 'Imported position details (database)';

  constructor(
    private readonly rawCharacteristics: PositionCharacteristicsRawRendererService,
    private readonly dbCharacteristics: PositionCharacteristicsDbRendererService,
    private readonly rawSkills: PositionStartingSkillsRawRendererService,
    private readonly dbSkills: PositionStartingSkillsDbRendererService,
    private readonly rawKeywords: PositionKeywordsRawRendererService,
    private readonly dbKeywords: PositionKeywordsDbRendererService,
    private readonly query: RacePositionsQueryService,
    private readonly html: HtmlService,
    private readonly sections: SectionRenderService,
  ) {}

  async getRawSource(race: SampledRace): Promise<string> {
    const characteristics = await this.sections.render(() =>
      this.rawCharacteristics.render(race),
    );
    const skills = await this.sections.render(() =>
      this.rawSkills.render(race),
    );
    const keywords = await this.sections.render(() =>
      this.rawKeywords.render(race),
    );
    return (
      this.html.subheading('Position characteristics') +
      characteristics +
      this.html.subheading('Starting skills') +
      skills +
      this.html.subheading('Keywords (TP codes and manual curation)') +
      keywords
    );
  }

  async getImportedView(race: SampledRace): Promise<string> {
    const positions = await this.query.positionsFor(race.raceId);
    if (positions.length === 0) {
      return this.html.note(
        `No positions stored for race "${race.raceName}", so no position details to show.`,
      );
    }
    const rulesSets = await this.query.rulesSetsFor(race.raceId);
    if (rulesSets.length === 0) {
      return this.html.note(
        `Race "${race.raceName}" has no era mapped to a rules set.`,
      );
    }
    const characteristics = await this.sections.render(() =>
      this.dbCharacteristics.render(race),
    );
    const skills = await this.sections.render(() => this.dbSkills.render(race));
    const keywords = await this.sections.render(() =>
      this.dbKeywords.render(race),
    );
    return (
      this.html.subheading('Position characteristics') +
      characteristics +
      this.html.subheading('Starting skills') +
      skills +
      this.html.subheading('Keywords') +
      keywords
    );
  }
}
