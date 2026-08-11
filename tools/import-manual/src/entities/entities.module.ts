import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { ReferenceResolverService } from '../references/reference-resolver.service';
import { CoachesProcessor } from './coaches.processor';
import { CompetitionsProcessor } from './competitions.processor';
import { ErasProcessor } from './eras.processor';
import { ExternalSystemsProcessor } from './external-systems.processor';
import { LeaguesProcessor } from './leagues.processor';
import { PositionsProcessor } from './positions.processor';
import { RacesProcessor } from './races.processor';
import { RulesSetsProcessor } from './rules-sets.processor';
import { SppAwardValuesProcessor } from './spp-award-values.processor';
import { TeamsProcessor } from './teams.processor';

const processors = [
  ExternalSystemsProcessor,
  RulesSetsProcessor,
  LeaguesProcessor,
  ErasProcessor,
  RacesProcessor,
  PositionsProcessor,
  CoachesProcessor,
  TeamsProcessor,
  CompetitionsProcessor,
  SppAwardValuesProcessor,
];

@Module({
  imports: [ImportModule],
  providers: [...processors, ReferenceResolverService],
  exports: processors,
})
export class EntitiesModule {}
