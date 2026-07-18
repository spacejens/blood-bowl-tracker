import { Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { SourceConfigService } from './source-config.service';
import { TpSourceReader } from './tp-source-reader';

@Module({
  imports: [EraDataConfigModule],
  providers: [SourceConfigService, TpSourceReader],
  exports: [SourceConfigService, TpSourceReader],
})
export class SourceModule {}
