import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DownloaderModule } from './downloader/downloader.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: false,
      isGlobal: true,
    }),
    DownloaderModule,
  ],
})
export class AppModule {}
