import { Module } from '@nestjs/common';
import { ImportModule } from '@blood-bowl-tracker/import';
import { BblCoachesImportService } from './bbl-coaches-import.service';

@Module({
  imports: [ImportModule],
  providers: [BblCoachesImportService],
  exports: [BblCoachesImportService],
})
export class BblModule {}
