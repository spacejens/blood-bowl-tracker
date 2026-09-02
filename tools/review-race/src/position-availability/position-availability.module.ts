import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { PositionAvailabilityDbRendererService } from './position-availability-db-renderer.service';
import { PositionAvailabilityRawRendererService } from './position-availability-raw-renderer.service';
import { PositionAvailabilityReviewerService } from './position-availability-reviewer.service';

/**
 * The position-availability data type: raw panels from each source's own view
 * of which positions a race can field, and an imported panel from the
 * database's `positions_race_eras` rows.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    PositionAvailabilityDbRendererService,
    PositionAvailabilityRawRendererService,
    PositionAvailabilityReviewerService,
  ],
  exports: [PositionAvailabilityReviewerService],
})
export class PositionAvailabilityModule {}
