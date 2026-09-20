import { Module } from '@nestjs/common';

import { KeywordsService } from './keywords.service';

@Module({
  providers: [KeywordsService],
  exports: [KeywordsService],
})
export class KeywordsModule {}
