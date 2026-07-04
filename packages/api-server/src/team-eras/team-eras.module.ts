import { Module } from '@nestjs/common';
import { TeamErasController } from './team-eras.controller';
import { TeamErasService } from './team-eras.service';

@Module({ controllers: [TeamErasController], providers: [TeamErasService] })
export class TeamErasModule {}
