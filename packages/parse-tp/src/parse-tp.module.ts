import { Module } from '@nestjs/common';

import { InscriptionsParserService } from './inscriptions-parser.service';
import { MatchParserService } from './match-parser.service';
import { RosterParserService } from './roster-parser.service';
import { TournamentParserService } from './tournament-parser.service';

@Module({
  providers: [
    TournamentParserService,
    MatchParserService,
    InscriptionsParserService,
    RosterParserService,
  ],
  exports: [
    TournamentParserService,
    MatchParserService,
    InscriptionsParserService,
    RosterParserService,
  ],
})
export class ParseTpModule {}
