import { Module } from '@nestjs/common';

import { InsightsModule } from '../insights/insights.module';
import { DeepdiveCommandService } from './deepdive-command.service';
import { InsightsCommandService } from './insights-command.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

@Module({
  imports: [InsightsModule],
  providers: [
    InsightsCommandService,
    DeepdiveCommandService,
    SlashCommandRegistryService,
  ],
  exports: [InsightsCommandService],
})
export class SlashCommandsModule {}
