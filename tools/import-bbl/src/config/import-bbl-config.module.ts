import { Global, Module } from '@nestjs/common';

import {
  IMPORT_BBL_CONFIG_PATH,
  ImportBblConfigService,
  resolveImportBblConfigPath,
} from './import-bbl-config.service';

@Global()
@Module({
  providers: [
    {
      provide: IMPORT_BBL_CONFIG_PATH,
      useFactory: resolveImportBblConfigPath,
    },
    ImportBblConfigService,
  ],
  exports: [ImportBblConfigService],
})
export class ImportBblConfigModule {}
