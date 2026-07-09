import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { BblLeaguesImportService } from './bbl-leagues-import.service';
import { LeagueConfigService } from './league-config.service';

@Module({
  imports: [ImportModule, ConfigModule],
  providers: [LeagueConfigService, BblLeaguesImportService],
  exports: [BblLeaguesImportService],
})
export class LeaguesModule {}
