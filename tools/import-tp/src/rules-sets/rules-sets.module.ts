import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpRulesSetsImportService } from './tp-rules-sets-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [TpRulesSetsImportService],
  exports: [TpRulesSetsImportService],
})
export class RulesSetsModule {}
