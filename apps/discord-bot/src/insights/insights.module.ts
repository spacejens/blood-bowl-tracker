import { Module } from '@nestjs/common';
import { StatsSummaryService } from './stats-summary.service';

@Module({
  providers: [StatsSummaryService],
  exports: [StatsSummaryService],
})
export class InsightsModule {}
