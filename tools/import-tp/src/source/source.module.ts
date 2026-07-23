import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { ExternalSystemNameConfigService } from './external-system-name-config.service';
import { RosterCollectionService } from './roster-collection.service';
import { SourceConfigService } from './source-config.service';
import { TpSourceReader } from './tp-source-reader';

@Module({
  imports: [EraDataConfigModule, ParseTpModule, ImportModule],
  providers: [
    SourceConfigService,
    ExternalSystemNameConfigService,
    TpSourceReader,
    RosterCollectionService,
  ],
  exports: [
    SourceConfigService,
    ExternalSystemNameConfigService,
    TpSourceReader,
    RosterCollectionService,
  ],
})
export class SourceModule {}
