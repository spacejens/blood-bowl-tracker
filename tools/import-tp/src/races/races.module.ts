import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { SourceModule } from '../source/source.module';
import { TpRacesImportService } from './tp-races-import.service';

@Module({
  imports: [ImportModule, SourceModule, EraDataConfigModule],
  providers: [TpRacesImportService],
  exports: [TpRacesImportService],
})
export class RacesModule {}
