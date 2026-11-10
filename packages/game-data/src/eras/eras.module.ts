import { Module } from '@nestjs/common';

import { ErasService } from './eras.service';

@Module({
  providers: [ErasService],
  exports: [ErasService],
})
export class ErasModule {}
