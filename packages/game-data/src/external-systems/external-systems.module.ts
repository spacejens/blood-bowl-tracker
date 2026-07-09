import { Module } from '@nestjs/common';

import { ExternalSystemsService } from './external-systems.service';

@Module({
  providers: [ExternalSystemsService],
  exports: [ExternalSystemsService],
})
export class ExternalSystemsModule {}
