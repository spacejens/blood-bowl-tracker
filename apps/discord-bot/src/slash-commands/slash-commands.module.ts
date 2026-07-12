import { Module } from '@nestjs/common';

import { InsightsModule } from '../insights/insights.module';
import { InsightsCommandService } from './insights-command.service';
import { StatsCommandService } from './stats-command.service';

@Module({
  imports: [InsightsModule],
  providers: [StatsCommandService, InsightsCommandService],
  exports: [InsightsCommandService],
})
export class SlashCommandsModule {}
