import { Module } from '@nestjs/common';

import { BblRawPageLoaderService } from './bbl-raw-page-loader.service';
import { TpRawMatchFileLoaderService } from './tp-raw-match-file-loader.service';

@Module({
  providers: [BblRawPageLoaderService, TpRawMatchFileLoaderService],
  exports: [BblRawPageLoaderService, TpRawMatchFileLoaderService],
})
export class SourceModule {}
