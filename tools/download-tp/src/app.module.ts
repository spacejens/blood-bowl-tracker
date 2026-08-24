import { Module } from '@nestjs/common';

import { DownloadTpConfigModule } from './config/download-tp-config.module';
import { DownloaderModule } from './downloader/downloader.module';

@Module({
  imports: [DownloadTpConfigModule, DownloaderModule],
})
export class AppModule {}
