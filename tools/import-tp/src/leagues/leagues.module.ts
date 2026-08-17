import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { LeagueConfigService } from './league-config.service';
import { TpLeaguesImportService } from './tp-leagues-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [LeagueConfigService, TpLeaguesImportService],
  exports: [LeagueConfigService, TpLeaguesImportService],
})
export class LeaguesModule {}
