import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DownloadTpConfigModule } from './config/download-tp-config.module';
import { DownloaderModule } from './downloader/downloader.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: false,
      isGlobal: true,
    }),
    DownloadTpConfigModule,
    DownloaderModule,
  ],
})
export class AppModule {}
