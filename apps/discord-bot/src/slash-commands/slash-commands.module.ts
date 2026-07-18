import { Module } from '@nestjs/common';

import { InsightsModule } from '../insights/insights.module';
import { InsightsCommandService } from './insights-command.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

@Module({
  imports: [InsightsModule],
  providers: [InsightsCommandService, SlashCommandRegistryService],
  exports: [InsightsCommandService],
})
export class SlashCommandsModule {}
