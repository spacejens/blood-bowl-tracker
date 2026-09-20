import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { TpSkillResolverService } from './tp-skill-resolver.service';

@Module({
  imports: [ImportModule],
  providers: [TpSkillResolverService],
  exports: [TpSkillResolverService],
})
export class SkillsModule {}
