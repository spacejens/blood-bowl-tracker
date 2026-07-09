import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraConfigModule } from '../eras/era-config.module';
import { SourceModule } from '../source/source.module';
import { BblRulesSetsImportService } from './bbl-rules-sets-import.service';

@Module({
  imports: [ImportModule, EraConfigModule, SourceModule],
  providers: [BblRulesSetsImportService],
  exports: [BblRulesSetsImportService],
})
export class RulesSetsModule {}
