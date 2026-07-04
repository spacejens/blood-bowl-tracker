import { Module } from '@nestjs/common';
import { ExternalSystemsController } from './external-systems.controller';
import { ExternalSystemsService } from './external-systems.service';

@Module({
  controllers: [ExternalSystemsController],
  providers: [ExternalSystemsService],
  exports: [ExternalSystemsService],
})
export class ExternalSystemsModule {}
