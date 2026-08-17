import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { LeaguesModule } from '../leagues/leagues.module';
import { SourceModule } from '../source/source.module';
import { EraDataConfigModule } from './era-data-config.module';
import { TpErasImportService } from './tp-eras-import.service';

@Module({
  imports: [
    ImportModule,
    EraDataConfigModule,
    SourceModule,
    ParseTpModule,
    LeaguesModule,
  ],
  providers: [TpErasImportService],
  exports: [TpErasImportService],
})
export class ErasModule {}
