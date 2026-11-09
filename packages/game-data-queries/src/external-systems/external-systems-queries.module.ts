import { Module } from '@nestjs/common';

import { ExternalSystemsQueriesService } from './external-systems-queries.service';

@Module({
  providers: [ExternalSystemsQueriesService],
  exports: [ExternalSystemsQueriesService],
})
export class ExternalSystemsQueriesModule {}
