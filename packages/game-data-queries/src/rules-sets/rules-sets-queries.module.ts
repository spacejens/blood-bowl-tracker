import { Module } from '@nestjs/common';

import { RulesSetsQueriesService } from './rules-sets-queries.service';

@Module({
  providers: [RulesSetsQueriesService],
  exports: [RulesSetsQueriesService],
})
export class RulesSetsQueriesModule {}
