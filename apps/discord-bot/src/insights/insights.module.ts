import { CoachesModule, TeamsModule } from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { StatsSummaryService } from './stats-summary.service';

@Module({
  imports: [CoachesModule, TeamsModule],
  providers: [StatsSummaryService],
  exports: [StatsSummaryService, CoachesModule, TeamsModule],
})
export class InsightsModule {}
