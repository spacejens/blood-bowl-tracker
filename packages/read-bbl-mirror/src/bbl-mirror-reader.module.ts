import { Module } from '@nestjs/common';

import { BblMirrorReaderService } from './bbl-mirror-reader.service';

@Module({
  providers: [BblMirrorReaderService],
  exports: [BblMirrorReaderService],
})
export class BblMirrorReaderModule {}
