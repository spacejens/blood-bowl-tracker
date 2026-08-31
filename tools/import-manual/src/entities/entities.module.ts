import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { ReferenceResolverService } from '../references/reference-resolver.service';
import { CoachesProcessor } from './coaches.processor';
import { CompetitionGroupsProcessor } from './competition-groups.processor';
import { CompetitionsProcessor } from './competitions.processor';
import { ErasProcessor } from './eras.processor';
import { ExternalSystemsProcessor } from './external-systems.processor';
import { LeaguesProcessor } from './leagues.processor';
import { PositionRulesSetsProcessor } from './position-rules-sets.processor';
import { PositionsProcessor } from './positions.processor';
import { RacesProcessor } from './races.processor';
import { RulesSetsProcessor } from './rules-sets.processor';
import { SppAwardValuesProcessor } from './spp-award-values.processor';
import { TeamsProcessor } from './teams.processor';
import { TrophiesProcessor } from './trophies.processor';

const processors = [
  ExternalSystemsProcessor,
  RulesSetsProcessor,
  LeaguesProcessor,
  ErasProcessor,
  RacesProcessor,
  PositionsProcessor,
  PositionRulesSetsProcessor,
  CoachesProcessor,
  TeamsProcessor,
  CompetitionGroupsProcessor,
  CompetitionsProcessor,
  SppAwardValuesProcessor,
  TrophiesProcessor,
];

@Module({
  imports: [ImportModule],
  providers: [...processors, ReferenceResolverService],
  exports: processors,
})
export class EntitiesModule {}
