import { Global, Module } from '@nestjs/common';

import {
  DEFAULT_IMPORT_TP_CONFIG_PATH,
  IMPORT_TP_CONFIG_PATH,
  ImportTpConfigService,
} from './import-tp-config.service';

@Global()
@Module({
  providers: [
    {
      provide: IMPORT_TP_CONFIG_PATH,
      useValue: DEFAULT_IMPORT_TP_CONFIG_PATH,
    },
    ImportTpConfigService,
  ],
  exports: [ImportTpConfigService],
})
export class ImportTpConfigModule {}
