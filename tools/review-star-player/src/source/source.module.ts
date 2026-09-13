import { BblMirrorReaderModule } from '@blood-bowl-tracker/read-bbl-mirror';
import { Module } from '@nestjs/common';

import { BblMirrorReaderService } from './bbl-mirror-reader.service';
import { BblRawStarPlayerPageService } from './bbl-raw-star-player-page.service';
import { ManualRawDataService } from './manual-raw-data.service';
import { TpRawStarPlayerIndexService } from './tp-raw-star-player-index.service';

/**
 * Reads each source's raw files. Loaders locate, decode and shape — every
 * judgement about what the values mean lives in a data-type module. None of
 * these services imports tools/import-bbl, tools/import-tp,
 * tools/import-manual or packages/parse-tp: a bug in shared parsing must not
 * agree with itself against the raw display.
 */
const SOURCES = [
  BblMirrorReaderService,
  BblRawStarPlayerPageService,
  ManualRawDataService,
  TpRawStarPlayerIndexService,
];

@Module({
  imports: [BblMirrorReaderModule],
  providers: SOURCES,
  exports: SOURCES,
})
export class SourceModule {}
