import { Module } from '@nestjs/common';

import { PositionAvailabilityModule } from '../position-availability/position-availability.module';
import { RaceIdentityModule } from '../race-identity/race-identity.module';
import { SharedModule } from '../shared/shared.module';
import { RaceAndAvailabilityReviewerService } from './race-and-availability-reviewer.service';

/**
 * The race-and-availability panel pair: one reviewer stacking the race
 * identity and position availability renderers its two feature modules
 * export.
 */
@Module({
  imports: [SharedModule, RaceIdentityModule, PositionAvailabilityModule],
  providers: [RaceAndAvailabilityReviewerService],
  exports: [RaceAndAvailabilityReviewerService],
})
export class RaceAndAvailabilityModule {}
