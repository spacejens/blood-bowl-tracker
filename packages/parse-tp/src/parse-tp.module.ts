import { Module } from '@nestjs/common';

import { InscriptionsParserService } from './inscriptions-parser.service';
import { MatchEventParserService } from './match-event-parser.service';
import { MatchParserService } from './match-parser.service';
import { RosterParserService } from './roster-parser.service';
import { TournamentParserService } from './tournament-parser.service';

@Module({
  providers: [
    TournamentParserService,
    MatchParserService,
    MatchEventParserService,
    InscriptionsParserService,
    RosterParserService,
  ],
  exports: [
    TournamentParserService,
    MatchParserService,
    MatchEventParserService,
    InscriptionsParserService,
    RosterParserService,
  ],
})
export class ParseTpModule {}
