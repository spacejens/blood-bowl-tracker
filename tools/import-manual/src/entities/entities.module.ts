import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { ReferenceResolverService } from '../references/reference-resolver.service';
import { CoachesProcessor } from './coaches.processor';
import { CompetitionGroupsProcessor } from './competition-groups.processor';
import { CompetitionsProcessor } from './competitions.processor';
import { ErasProcessor } from './eras.processor';
import { ExternalSystemsProcessor } from './external-systems.processor';
import { LeaguesProcessor } from './leagues.processor';
import { PositionRulesSetSkillsProcessor } from './position-rules-set-skills.processor';
import { PositionRulesSetsProcessor } from './position-rules-sets.processor';
import { PositionsProcessor } from './positions.processor';
import { RacesProcessor } from './races.processor';
import { RulesSetsProcessor } from './rules-sets.processor';
import { SkillRulesSetsProcessor } from './skill-rules-sets.processor';
import { SkillsProcessor } from './skills.processor';
import { SppAwardValuesProcessor } from './spp-award-values.processor';
import { TeamsProcessor } from './teams.processor';
import { TrophiesProcessor } from './trophies.processor';
import { TrophyAwardsProcessor } from './trophy-awards.processor';

const processors = [
  ExternalSystemsProcessor,
  RulesSetsProcessor,
  SkillsProcessor,
  SkillRulesSetsProcessor,
  LeaguesProcessor,
  ErasProcessor,
  RacesProcessor,
  PositionsProcessor,
  PositionRulesSetsProcessor,
  PositionRulesSetSkillsProcessor,
  CoachesProcessor,
  TeamsProcessor,
  CompetitionGroupsProcessor,
  CompetitionsProcessor,
  SppAwardValuesProcessor,
  TrophiesProcessor,
  TrophyAwardsProcessor,
];

@Module({
  imports: [ImportModule],
  providers: [...processors, ReferenceResolverService],
  exports: processors,
})
export class EntitiesModule {}
