import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { TpSkillResolverService } from './tp-skill-resolver.service';

@Module({
  imports: [ImportModule, ParseTpModule],
  providers: [TpSkillResolverService],
  exports: [TpSkillResolverService],
})
export class SkillsModule {}
