import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { CoachesProcessor } from './coaches.processor';
import { ErasProcessor } from './eras.processor';
import { ExternalSystemsProcessor } from './external-systems.processor';
import { LeaguesProcessor } from './leagues.processor';
import { PositionsProcessor } from './positions.processor';
import { RacesProcessor } from './races.processor';
import { RulesSetsProcessor } from './rules-sets.processor';
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
];

@Module({
  imports: [ImportModule],
  providers: processors,
  exports: processors,
})
export class EntitiesModule {}
