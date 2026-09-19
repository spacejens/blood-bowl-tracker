import { Module } from '@nestjs/common';

import { BatchBufferService } from './batch-buffer.service';
import { CoachesImportService } from './coaches-import.service';
import { CompetitionGroupsImportService } from './competition-groups-import.service';
import { CompetitionsImportService } from './competitions-import.service';
import { ErasImportService } from './eras-import.service';
import { ExternalIdResolverService } from './external-id-resolver.service';
import { ExternalSystemBootstrapService } from './external-system-bootstrap.service';
import { ExternalSystemsImportService } from './external-systems-import.service';
import { ImportResultService } from './import-result.service';
import { ImportRunnerService } from './import-runner.service';
import { KeywordsImportService } from './keywords-import.service';
import { LastingInjuriesImportService } from './lasting-injuries-import.service';
import { LeaguesImportService } from './leagues-import.service';
import { MatchDateRangeService } from './match-date-range.service';
import { MatchEventsImportService } from './match-events-import.service';
import { MatchOutcomesImportService } from './match-outcomes-import.service';
import { MatchesImportService } from './matches-import.service';
import { MissingTrophyAwardsImportService } from './missing-trophy-awards-import.service';
import { NameExternalIdService } from './name-external-id.service';
import { PlayerCharacteristicIncreasesService } from './player-characteristic-increases.service';
import { PlayerSkillsImportService } from './player-skills-import.service';
import { PlayersImportService } from './players-import.service';
import { PositionRulesSetKeywordsImportService } from './position-rules-set-keywords-import.service';
import { PositionRulesSetSkillsImportService } from './position-rules-set-skills-import.service';
import { PositionRulesSetsImportService } from './position-rules-sets-import.service';
import { PositionsImportService } from './positions-import.service';
import { RacesImportService } from './races-import.service';
import { ReferenceLookupService } from './reference-lookup.service';
import { RulesSetsImportService } from './rules-sets-import.service';
import { SkillRulesSetsImportService } from './skill-rules-sets-import.service';
import { SkillsImportService } from './skills-import.service';
import { SppAdjustmentsImportService } from './spp-adjustments-import.service';
import { SppAwardValuesImportService } from './spp-award-values-import.service';
import { StartingSkillsImportService } from './starting-skills-import.service';
import { TeamsImportService } from './teams-import.service';
import { TrophiesImportService } from './trophies-import.service';
import { TrophyAwardsImportService } from './trophy-awards-import.service';

@Module({
  providers: [
    ImportRunnerService,
    ImportResultService,
    BatchBufferService,
    CoachesImportService,
    CompetitionGroupsImportService,
    CompetitionsImportService,
    LastingInjuriesImportService,
    LeaguesImportService,
    MatchEventsImportService,
    MatchOutcomesImportService,
    MatchesImportService,
    MatchDateRangeService,
    MissingTrophyAwardsImportService,
    NameExternalIdService,
    KeywordsImportService,
    PlayerCharacteristicIncreasesService,
    PlayersImportService,
    PlayerSkillsImportService,
    PositionRulesSetKeywordsImportService,
    PositionRulesSetsImportService,
    PositionRulesSetSkillsImportService,
    PositionsImportService,
    RacesImportService,
    ExternalSystemsImportService,
    ExternalSystemBootstrapService,
    ExternalIdResolverService,
    ReferenceLookupService,
    RulesSetsImportService,
    SkillRulesSetsImportService,
    SkillsImportService,
    SppAdjustmentsImportService,
    SppAwardValuesImportService,
    StartingSkillsImportService,
    ErasImportService,
    TeamsImportService,
    TrophiesImportService,
    TrophyAwardsImportService,
  ],
  exports: [
    ImportRunnerService,
    ImportResultService,
    BatchBufferService,
    CoachesImportService,
    CompetitionGroupsImportService,
    CompetitionsImportService,
    LastingInjuriesImportService,
    LeaguesImportService,
    MatchEventsImportService,
    MatchOutcomesImportService,
    MatchesImportService,
    MatchDateRangeService,
    MissingTrophyAwardsImportService,
    NameExternalIdService,
    KeywordsImportService,
    PlayerCharacteristicIncreasesService,
    PlayersImportService,
    PlayerSkillsImportService,
    PositionRulesSetKeywordsImportService,
    PositionRulesSetsImportService,
    PositionRulesSetSkillsImportService,
    PositionsImportService,
    RacesImportService,
    ExternalSystemsImportService,
    ExternalSystemBootstrapService,
    ExternalIdResolverService,
    ReferenceLookupService,
    RulesSetsImportService,
    SkillRulesSetsImportService,
    SkillsImportService,
    SppAdjustmentsImportService,
    SppAwardValuesImportService,
    StartingSkillsImportService,
    ErasImportService,
    TeamsImportService,
    TrophiesImportService,
    TrophyAwardsImportService,
  ],
})
export class ImportModule {}
