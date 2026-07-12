import { Module } from '@nestjs/common';

import { InsightsModule } from '../insights/insights.module';
import { InsightsCommandService } from './insights-command.service';

@Module({
  imports: [InsightsModule],
  providers: [InsightsCommandService],
  exports: [InsightsCommandService],
})
export class SlashCommandsModule {}
