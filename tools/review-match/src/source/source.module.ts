import { Module } from '@nestjs/common';

import { BblRawPageLoaderService } from './bbl-raw-page-loader.service';
import { TpRawMatchFileLoaderService } from './tp-raw-match-file-loader.service';
import { TpRawPlayerNameResolverService } from './tp-raw-player-name-resolver.service';

@Module({
  providers: [
    BblRawPageLoaderService,
    TpRawMatchFileLoaderService,
    TpRawPlayerNameResolverService,
  ],
  exports: [
    BblRawPageLoaderService,
    TpRawMatchFileLoaderService,
    TpRawPlayerNameResolverService,
  ],
})
export class SourceModule {}
