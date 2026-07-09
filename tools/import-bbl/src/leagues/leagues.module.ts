import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImportModule } from '@blood-bowl-tracker/import';
import { LeagueConfigService } from './league-config.service';
import { BblLeaguesImportService } from './bbl-leagues-import.service';

@Module({
  imports: [ImportModule, ConfigModule],
  providers: [LeagueConfigService, BblLeaguesImportService],
  exports: [BblLeaguesImportService],
})
export class LeaguesModule {}
