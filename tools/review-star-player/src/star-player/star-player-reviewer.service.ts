import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { StarPlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledStarPlayer } from '../shared/review.types';
import { SectionRenderService } from '../shared/section-render.service';
import { StarPlayerCharacteristicsDbRendererService } from '../star-player-characteristics/characteristics-db-renderer.service';
import { StarPlayerCharacteristicsRawRendererService } from '../star-player-characteristics/characteristics-raw-renderer.service';
import { StarPlayerIdentityDbRendererService } from '../star-player-identity/identity-db-renderer.service';
import { StarPlayerIdentityRawRendererService } from '../star-player-identity/identity-raw-renderer.service';
import { StarPlayerKeywordsDbRendererService } from '../star-player-keywords/star-player-keywords-db-renderer.service';
import { StarPlayerKeywordsRawRendererService } from '../star-player-keywords/star-player-keywords-raw-renderer.service';
import { StarPlayerSkillsDbRendererService } from '../star-player-skills/star-player-skills-db-renderer.service';
import { StarPlayerSkillsRawRendererService } from '../star-player-skills/star-player-skills-raw-renderer.service';

/**
 * The star-player panel pair: who the star is and what it brings onto the
 * pitch. Each panel stacks identity, characteristics, starting skills and
 * keywords, each rendered by that aspect's own raw or database renderer.
 *
 * The raw renderers already label every source sub-section with their aspect
 * (`Identity — BBL`), so the raw panel only stacks them. The database
 * renderers carry no sub-heading, so the imported panel puts one plain aspect
 * sub-heading above each. Every aspect runs through `SectionRenderService`, so
 * a failing aspect shows a failure note in its own place and the others still
 * render.
 */
@Injectable()
export class StarPlayerReviewerService implements StarPlayerDataTypeReviewer {
  readonly id = 'star-player';
  readonly rawPanelLabel = 'Raw sources (BBL / TP / manual curation)';
  readonly importedPanelLabel = 'Imported (database)';

  constructor(
    private readonly rawIdentity: StarPlayerIdentityRawRendererService,
    private readonly dbIdentity: StarPlayerIdentityDbRendererService,
    private readonly rawCharacteristics: StarPlayerCharacteristicsRawRendererService,
    private readonly dbCharacteristics: StarPlayerCharacteristicsDbRendererService,
    private readonly rawSkills: StarPlayerSkillsRawRendererService,
    private readonly dbSkills: StarPlayerSkillsDbRendererService,
    private readonly rawKeywords: StarPlayerKeywordsRawRendererService,
    private readonly dbKeywords: StarPlayerKeywordsDbRendererService,
    private readonly html: HtmlService,
    private readonly sections: SectionRenderService,
  ) {}

  async getRawSource(star: SampledStarPlayer): Promise<string> {
    const identity = await this.sections.render('Identity', () =>
      this.rawIdentity.render(star),
    );
    const characteristics = await this.sections.render('Characteristics', () =>
      this.rawCharacteristics.render(star),
    );
    const skills = await this.sections.render('Starting skills', () =>
      this.rawSkills.render(star),
    );
    const keywords = await this.sections.render('Keywords', () =>
      this.rawKeywords.render(star),
    );
    return identity + characteristics + skills + keywords;
  }

  async getImportedView(star: SampledStarPlayer): Promise<string> {
    const identity = await this.sections.render('Identity', () =>
      this.dbIdentity.render(star),
    );
    const characteristics = await this.sections.render('Characteristics', () =>
      this.dbCharacteristics.render(star),
    );
    const skills = await this.sections.render('Starting skills', () =>
      this.dbSkills.render(star),
    );
    const keywords = await this.sections.render('Keywords', () =>
      this.dbKeywords.render(star),
    );
    return (
      this.html.subheading('Identity') +
      identity +
      this.html.subheading('Characteristics') +
      characteristics +
      this.html.subheading('Starting skills') +
      skills +
      this.html.subheading('Keywords') +
      keywords
    );
  }
}
