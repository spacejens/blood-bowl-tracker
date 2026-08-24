import { Module } from '@nestjs/common';

import { DbGenerateService } from './db-generate.service.js';

@Module({
  providers: [DbGenerateService],
})
export class DbGenerateModule {}
