import { Module } from '@nestjs/common';

import { InscriptionsParserService } from './inscriptions-parser.service';
import { MatchParserService } from './match-parser.service';
import { TournamentParserService } from './tournament-parser.service';

@Module({
  providers: [
    TournamentParserService,
    MatchParserService,
    InscriptionsParserService,
  ],
  exports: [
    TournamentParserService,
    MatchParserService,
    InscriptionsParserService,
  ],
})
export class ParseTpModule {}
