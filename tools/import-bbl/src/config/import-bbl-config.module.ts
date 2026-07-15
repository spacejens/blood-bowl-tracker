import { Global, Module } from '@nestjs/common';

import {
  DEFAULT_IMPORT_BBL_CONFIG_PATH,
  IMPORT_BBL_CONFIG_PATH,
  ImportBblConfigService,
} from './import-bbl-config.service';

@Global()
@Module({
  providers: [
    {
      provide: IMPORT_BBL_CONFIG_PATH,
      useValue: DEFAULT_IMPORT_BBL_CONFIG_PATH,
    },
    ImportBblConfigService,
  ],
  exports: [ImportBblConfigService],
})
export class ImportBblConfigModule {}
