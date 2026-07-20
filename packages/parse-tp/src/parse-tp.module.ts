import { Module } from '@nestjs/common';

import { MatchParserService } from './match-parser.service';
import { TournamentParserService } from './tournament-parser.service';

@Module({
  providers: [TournamentParserService, MatchParserService],
  exports: [TournamentParserService, MatchParserService],
})
export class ParseTpModule {}
