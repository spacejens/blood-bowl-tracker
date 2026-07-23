import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { DataFileModule } from '../data-file/data-file.module';
import { EntitiesModule } from '../entities/entities.module';
import { ManualImportService } from './manual-import.service';

@Module({
  imports: [DataFileModule, EntitiesModule, ImportModule],
  providers: [ManualImportService],
  exports: [ManualImportService],
})
export class ManualImportModule {}
