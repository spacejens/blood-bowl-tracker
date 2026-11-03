import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { PositionAvailabilityDbRendererService } from '../position-availability/position-availability-db-renderer.service';
import { PositionAvailabilityRawRendererService } from '../position-availability/position-availability-raw-renderer.service';
import { RaceIdentityDbRendererService } from '../race-identity/race-identity-db-renderer.service';
import { RaceIdentityRawRendererService } from '../race-identity/race-identity-raw-renderer.service';
import type { RaceDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledRace } from '../shared/review.types';
import { SectionRenderService } from '../shared/section-render.service';

/**
 * The race-and-availability panel pair: what the race is and which positions
 * it can field. Each panel stacks the race identity and position availability
 * parts under their own subheadings, each rendered by that aspect's own raw or
 * database renderer. A race has no single source, so the raw panel shows BBL,
 * TP and manual curation together in every part.
 */
@Injectable()
export class RaceAndAvailabilityReviewerService implements RaceDataTypeReviewer {
  readonly id = 'race-and-availability';
  readonly rawPanelLabel = 'Raw sources (BBL / TP / manual curation)';
  readonly importedPanelLabel = 'Imported race and availability (database)';

  constructor(
    private readonly rawIdentity: RaceIdentityRawRendererService,
    private readonly dbIdentity: RaceIdentityDbRendererService,
    private readonly rawAvailability: PositionAvailabilityRawRendererService,
    private readonly dbAvailability: PositionAvailabilityDbRendererService,
    private readonly html: HtmlService,
    private readonly sections: SectionRenderService,
  ) {}

  async getRawSource(race: SampledRace): Promise<string> {
    const identity = await this.sections.render(() =>
      this.rawIdentity.render(race),
    );
    const availability = await this.sections.render(() =>
      this.rawAvailability.render(race),
    );
    return this.stack(identity, availability);
  }

  async getImportedView(race: SampledRace): Promise<string> {
    const identity = await this.sections.render(() =>
      this.dbIdentity.render(race),
    );
    const availability = await this.sections.render(() =>
      this.dbAvailability.render(race),
    );
    return this.stack(identity, availability);
  }

  private stack(identity: string, availability: string): string {
    return (
      this.html.subheading('Race identity') +
      identity +
      this.html.subheading('Position availability') +
      availability
    );
  }
}
