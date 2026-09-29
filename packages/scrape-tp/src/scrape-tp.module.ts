import { Module } from '@nestjs/common';

import { TpFetcherService } from './tp-fetcher.service';
import { TpGateService } from './tp-gate.service';

/**
 * TP fetching. `TpGateService` is provided here and not exported: one
 * instance per application, shared by every session `TpFetcherService`
 * creates, however many modules import this one.
 */
@Module({
  providers: [TpGateService, TpFetcherService],
  exports: [TpFetcherService],
})
export class ScrapeTpModule {}
