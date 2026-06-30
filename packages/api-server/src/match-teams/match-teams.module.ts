import { Module } from '@nestjs/common';
import { MatchTeamsController } from './match-teams.controller';
import { MatchTeamsService } from './match-teams.service';

@Module({ controllers: [MatchTeamsController], providers: [MatchTeamsService] })
export class MatchTeamsModule {}
