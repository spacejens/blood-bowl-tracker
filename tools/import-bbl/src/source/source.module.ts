import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SourceConfigService } from './source-config.service';
import { BblSourceReader } from './bbl-source-reader';

@Module({
  imports: [ConfigModule],
  providers: [SourceConfigService, BblSourceReader],
  exports: [BblSourceReader],
})
export class SourceModule {}
