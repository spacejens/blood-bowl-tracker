import { Module } from '@nestjs/common';
import { CoachesService } from './coaches.service';

@Module({
  providers: [CoachesService],
  exports: [CoachesService],
})
export class CoachesModule {}
