import { Module } from '@nestjs/common';
import { CompetitionTeamsController } from './competition-teams.controller';
import { CompetitionTeamsService } from './competition-teams.service';

@Module({
  controllers: [CompetitionTeamsController],
  providers: [CompetitionTeamsService],
})
export class CompetitionTeamsModule {}
