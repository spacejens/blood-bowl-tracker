import { Module } from '@nestjs/common';
import { InsightsModule } from '../insights/insights.module';
import { StatsCommandService } from './stats-command.service';

@Module({
  imports: [InsightsModule],
  providers: [StatsCommandService],
})
export class SlashCommandsModule {}
