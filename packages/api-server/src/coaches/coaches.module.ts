import { Module } from '@nestjs/common';
import { CoachesController } from './coaches.controller';
import { CoachesService } from './coaches.service';

@Module({ controllers: [CoachesController], providers: [CoachesService] })
export class CoachesModule {}
