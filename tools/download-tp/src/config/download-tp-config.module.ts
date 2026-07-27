import { Global, Module } from '@nestjs/common';

import {
  DEFAULT_DOWNLOAD_TP_CONFIG_PATH,
  DOWNLOAD_TP_CONFIG_PATH,
  DownloadTpConfigService,
} from './download-tp-config.service';

@Global()
@Module({
  providers: [
    {
      provide: DOWNLOAD_TP_CONFIG_PATH,
      useValue: DEFAULT_DOWNLOAD_TP_CONFIG_PATH,
    },
    DownloadTpConfigService,
  ],
  exports: [DownloadTpConfigService],
})
export class DownloadTpConfigModule {}
