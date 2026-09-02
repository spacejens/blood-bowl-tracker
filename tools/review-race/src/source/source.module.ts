import { Module } from '@nestjs/common';

import { BblMirrorReaderService } from './bbl-mirror-reader.service';
import { BblRawPositionPageService } from './bbl-raw-position-page.service';
import { BblRawRaceIndexService } from './bbl-raw-race-index.service';
import { ManualRawDataService } from './manual-raw-data.service';
import { TpRawRosterIndexService } from './tp-raw-roster-index.service';

/**
 * Reads each source's raw files. Loaders locate, decode and shape — every
 * judgement about what the values mean lives in a data-type module. None of
 * these services imports tools/import-bbl, tools/import-tp, tools/import-manual
 * or packages/parse-tp: a bug in shared parsing must not agree with itself
 * against the raw display.
 */
const SOURCES = [
  BblMirrorReaderService,
  BblRawPositionPageService,
  BblRawRaceIndexService,
  ManualRawDataService,
  TpRawRosterIndexService,
];

@Module({
  providers: SOURCES,
  exports: SOURCES,
})
export class SourceModule {}
