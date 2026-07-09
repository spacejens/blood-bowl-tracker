import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { BblErasImportService } from './bbl-eras-import.service';
import { EraConfigModule } from './era-config.module';

@Module({
  imports: [ImportModule, EraConfigModule, SourceModule],
  providers: [BblErasImportService],
  exports: [BblErasImportService],
})
export class ErasModule {}
