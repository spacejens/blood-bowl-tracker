import { Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { ExternalSystemNameConfigService } from './external-system-name-config.service';
import { SourceConfigService } from './source-config.service';
import { TpSourceReader } from './tp-source-reader';

@Module({
  imports: [EraDataConfigModule],
  providers: [
    SourceConfigService,
    ExternalSystemNameConfigService,
    TpSourceReader,
  ],
  exports: [
    SourceConfigService,
    ExternalSystemNameConfigService,
    TpSourceReader,
  ],
})
export class SourceModule {}
