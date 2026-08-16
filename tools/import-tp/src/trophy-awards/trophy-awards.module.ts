import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpAwardsReaderService } from './tp-awards-reader.service';
import { TpTrophyAwardsImportService } from './tp-trophy-awards-import.service';

@Module({
  imports: [ImportModule, SourceModule, ParseTpModule],
  providers: [TpAwardsReaderService, TpTrophyAwardsImportService],
  exports: [TpTrophyAwardsImportService],
})
export class TrophyAwardsModule {}
