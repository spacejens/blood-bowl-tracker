import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { TpEraRulesSetResolverService } from './tp-era-rules-set-resolver.service';

@Module({
  imports: [ImportModule],
  providers: [TpEraRulesSetResolverService],
  exports: [TpEraRulesSetResolverService],
})
export class EraRulesSetModule {}
