import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpRacesImportService } from './tp-races-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [TpRacesImportService],
  exports: [TpRacesImportService],
})
export class RacesModule {}
