import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { BblErasImportService } from './bbl-eras-import.service';
import { EraConfigModule } from './era-config.module';

@Module({
  imports: [ImportModule, EraConfigModule],
  providers: [BblErasImportService],
  exports: [BblErasImportService],
})
export class ErasModule {}
