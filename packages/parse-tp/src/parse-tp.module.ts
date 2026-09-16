import { Module } from '@nestjs/common';

import { AwardsParserService } from './awards-parser.service';
import { HatredTargetService } from './hatred-target.service';
import { InscriptionsParserService } from './inscriptions-parser.service';
import { MatchEventDecodersService } from './match-event-decoders.service';
import { MatchEventParserService } from './match-event-parser.service';
import { MatchParserService } from './match-parser.service';
import { OfficialTeamsParserService } from './official-teams-parser.service';
import { RosterParserService } from './roster-parser.service';
import { SecretObjectiveService } from './secret-objective.service';
import { SkillMasterNamesParserService } from './skill-master-names-parser.service';
import { TournamentParserService } from './tournament-parser.service';
import { WeatherTypeService } from './weather-type.service';

@Module({
  providers: [
    AwardsParserService,
    HatredTargetService,
    TournamentParserService,
    MatchParserService,
    MatchEventParserService,
    MatchEventDecodersService,
    InscriptionsParserService,
    OfficialTeamsParserService,
    RosterParserService,
    SecretObjectiveService,
    SkillMasterNamesParserService,
    WeatherTypeService,
  ],
  exports: [
    AwardsParserService,
    HatredTargetService,
    TournamentParserService,
    MatchParserService,
    MatchEventParserService,
    InscriptionsParserService,
    OfficialTeamsParserService,
    RosterParserService,
    SkillMasterNamesParserService,
  ],
})
export class ParseTpModule {}
