import { Module } from '@nestjs/common';

import { KeywordsQueriesService } from './keywords-queries.service';

@Module({
  providers: [KeywordsQueriesService],
  exports: [KeywordsQueriesService],
})
export class KeywordsQueriesModule {}
