import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { BblRulesSetsImportService } from './bbl-rules-sets-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [BblRulesSetsImportService],
  exports: [BblRulesSetsImportService],
})
export class RulesSetsModule {}
