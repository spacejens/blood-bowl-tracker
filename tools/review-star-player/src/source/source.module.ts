import { BblMirrorReaderModule } from '@blood-bowl-tracker/read-bbl-mirror';
import { Module } from '@nestjs/common';

import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
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
 *
 * `StarPlayerNameMatcherService` is registered here too, as its own instance,
 * rather than by importing `SharedModule` — `SharedModule` imports this
 * module (for `StarSourceLookupService`), so importing back would cycle. It
 * is pure and dependency-free, so a second instance behaves identically to
 * the one `SharedModule` provides.
 */
const SOURCES = [
  BblMirrorReaderService,
  BblRawStarPlayerPageService,
  ManualRawDataService,
  StarPlayerNameMatcherService,
  TpRawStarPlayerIndexService,
];

@Module({
  imports: [BblMirrorReaderModule],
  providers: SOURCES,
  exports: SOURCES,
})
export class SourceModule {}
