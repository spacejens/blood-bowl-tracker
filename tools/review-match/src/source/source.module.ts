import { BblMirrorReaderModule } from '@blood-bowl-tracker/read-bbl-mirror';
import { ReadTpFilesModule } from '@blood-bowl-tracker/read-tp-files';
import { Module } from '@nestjs/common';

import { BblRawPageLoaderService } from './bbl-raw-page-loader.service';
import { TpRawMatchFileLoaderService } from './tp-raw-match-file-loader.service';
import { TpRawPlayerNameResolverService } from './tp-raw-player-name-resolver.service';

@Module({
  imports: [BblMirrorReaderModule, ReadTpFilesModule],
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
