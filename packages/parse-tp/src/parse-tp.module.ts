import { Module } from '@nestjs/common';

import { AwardsParserService } from './awards-parser.service';
import { InscriptionsParserService } from './inscriptions-parser.service';
import { MatchEventDecodersService } from './match-event-decoders.service';
import { MatchEventParserService } from './match-event-parser.service';
import { MatchParserService } from './match-parser.service';
import { RosterParserService } from './roster-parser.service';
import { SecretObjectiveService } from './secret-objective.service';
import { TournamentParserService } from './tournament-parser.service';
import { WeatherTypeService } from './weather-type.service';

@Module({
  providers: [
    AwardsParserService,
    TournamentParserService,
    MatchParserService,
    MatchEventParserService,
    MatchEventDecodersService,
    InscriptionsParserService,
    RosterParserService,
    SecretObjectiveService,
    WeatherTypeService,
  ],
  exports: [
    AwardsParserService,
    TournamentParserService,
    MatchParserService,
    MatchEventParserService,
    InscriptionsParserService,
    RosterParserService,
  ],
})
export class ParseTpModule {}
