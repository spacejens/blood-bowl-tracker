import { Global, Module } from '@nestjs/common';

import {
  DEFAULT_IMPORT_MANUAL_CONFIG_PATH,
  IMPORT_MANUAL_CONFIG_PATH,
  ImportManualConfigService,
} from './import-manual-config.service';

@Global()
@Module({
  providers: [
    {
      provide: IMPORT_MANUAL_CONFIG_PATH,
      useValue: DEFAULT_IMPORT_MANUAL_CONFIG_PATH,
    },
    ImportManualConfigService,
  ],
  exports: [ImportManualConfigService],
})
export class ImportManualConfigModule {}
