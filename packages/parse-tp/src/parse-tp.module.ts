import { Module } from '@nestjs/common';

import { AwardsParserService } from './awards-parser.service';
import { InscriptionsParserService } from './inscriptions-parser.service';
import { MatchEventDecodersService } from './match-event-decoders.service';
import { MatchEventParserService } from './match-event-parser.service';
import { MatchParserService } from './match-parser.service';
import { OfficialTeamsParserService } from './official-teams-parser.service';
import { PhaseFixturesParserService } from './phase-fixtures-parser.service';
import { RosterParserService } from './roster-parser.service';
import { SecretObjectiveService } from './secret-objective.service';
import { SkillMasterNamesParserService } from './skill-master-names-parser.service';
import { TournamentParserService } from './tournament-parser.service';
import { TpOfficialListingPrecedenceService } from './tp-official-listing-precedence.service';
import { TpSkillCategoryMaskDecoderService } from './tp-skill-category-mask-decoder.service';
import { TpStarHireKeyService } from './tp-star-hire-key.service';
import { WeatherTypeService } from './weather-type.service';

@Module({
  providers: [
    AwardsParserService,
    TournamentParserService,
    MatchParserService,
    MatchEventParserService,
    MatchEventDecodersService,
    InscriptionsParserService,
    OfficialTeamsParserService,
    PhaseFixturesParserService,
    RosterParserService,
    SecretObjectiveService,
    SkillMasterNamesParserService,
    TpOfficialListingPrecedenceService,
    TpSkillCategoryMaskDecoderService,
    TpStarHireKeyService,
    WeatherTypeService,
  ],
  exports: [
    AwardsParserService,
    TournamentParserService,
    MatchParserService,
    MatchEventParserService,
    InscriptionsParserService,
    OfficialTeamsParserService,
    PhaseFixturesParserService,
    RosterParserService,
    SkillMasterNamesParserService,
    TpOfficialListingPrecedenceService,
    TpStarHireKeyService,
  ],
})
export class ParseTpModule {}
