import { Global, Module } from '@nestjs/common';

import {
  IMPORT_TP_CONFIG_PATH,
  ImportTpConfigService,
  resolveImportTpConfigPath,
} from './import-tp-config.service';

@Global()
@Module({
  providers: [
    {
      provide: IMPORT_TP_CONFIG_PATH,
      useFactory: resolveImportTpConfigPath,
    },
    ImportTpConfigService,
  ],
  exports: [ImportTpConfigService],
})
export class ImportTpConfigModule {}
