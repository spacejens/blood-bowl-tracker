import { Module } from '@nestjs/common';

import { TpFileNameService } from './tp-file-name.service';
import { TpFilesReaderService } from './tp-files-reader.service';

@Module({
  providers: [TpFileNameService, TpFilesReaderService],
  exports: [TpFileNameService, TpFilesReaderService],
})
export class ReadTpFilesModule {}
