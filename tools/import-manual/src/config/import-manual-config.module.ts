import { Global, Module } from '@nestjs/common';

import {
  IMPORT_MANUAL_CONFIG_PATH,
  ImportManualConfigService,
  resolveImportManualConfigPath,
} from './import-manual-config.service';

@Global()
@Module({
  providers: [
    {
      provide: IMPORT_MANUAL_CONFIG_PATH,
      useFactory: resolveImportManualConfigPath,
    },
    ImportManualConfigService,
  ],
  exports: [ImportManualConfigService],
})
export class ImportManualConfigModule {}
