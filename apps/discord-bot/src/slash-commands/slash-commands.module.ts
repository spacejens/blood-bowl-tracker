import { Module } from '@nestjs/common';
import { InsightsModule } from '../insights/insights.module';
import { StatsCommandService } from './stats-command.service';

// If more slash-command services are added here, they must NOT each call
// DiscordClientService#registerCommands independently — that method
// replaces a guild's full command list, so separate calls would overwrite
// each other's commands. Collect all command definitions and register them
// through a single registerCommands call (e.g. one bootstrap registrant).
@Module({
  imports: [InsightsModule],
  providers: [StatsCommandService],
})
export class SlashCommandsModule {}
