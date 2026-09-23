import { Module } from '@nestjs/common';

import { TpFetcherService } from './tp-fetcher.service';

@Module({
  providers: [TpFetcherService],
  exports: [TpFetcherService],
})
export class ScrapeTpModule {}
