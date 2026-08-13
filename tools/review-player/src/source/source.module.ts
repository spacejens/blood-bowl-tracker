import { Module } from '@nestjs/common';

import { BblRawPlayerPageLoaderService } from './bbl-raw-player-page-loader.service';
import { TpRawPlayerIndexService } from './tp-raw-player-index.service';

/**
 * Reads each source's downloaded raw files. Loaders only locate and decode —
 * every interpretation of what they return lives in a data-type module.
 */
@Module({
  providers: [BblRawPlayerPageLoaderService, TpRawPlayerIndexService],
  exports: [BblRawPlayerPageLoaderService, TpRawPlayerIndexService],
})
export class SourceModule {}
