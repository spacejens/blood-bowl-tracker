import { Module } from '@nestjs/common';

import { ManualDataReader } from './manual-data-reader.service';

@Module({
  providers: [ManualDataReader],
  exports: [ManualDataReader],
})
export class DataFileModule {}
