import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { PositionAvailabilityDbRendererService } from './position-availability-db-renderer.service';
import { PositionAvailabilityRawRendererService } from './position-availability-raw-renderer.service';

/**
 * The position-availability aspect: the raw renderer for each source's own
 * view of which positions a race can field, and the database renderer for
 * its `positions_race_eras` rows. The race-and-availability panel pair stacks
 * them.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    PositionAvailabilityDbRendererService,
    PositionAvailabilityRawRendererService,
  ],
  exports: [
    PositionAvailabilityDbRendererService,
    PositionAvailabilityRawRendererService,
  ],
})
export class PositionAvailabilityModule {}
