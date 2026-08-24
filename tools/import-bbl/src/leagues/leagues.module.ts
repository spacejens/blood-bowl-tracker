import {
  ConfigErrorMessageService,
  ImportModule,
} from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { BblLeaguesImportService } from './bbl-leagues-import.service';
import { LeagueConfigService } from './league-config.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [
    ConfigErrorMessageService,
    LeagueConfigService,
    BblLeaguesImportService,
  ],
  exports: [BblLeaguesImportService],
})
export class LeaguesModule {}
