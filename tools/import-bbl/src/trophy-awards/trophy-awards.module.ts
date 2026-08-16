import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { MatchesModule } from '../matches/matches.module';
import { SourceModule } from '../source/source.module';
import { BblTrophyAwardsImportService } from './bbl-trophy-awards-import.service';

@Module({
  imports: [SourceModule, ImportModule, MatchesModule],
  providers: [BblTrophyAwardsImportService],
  exports: [BblTrophyAwardsImportService],
})
export class TrophyAwardsModule {}
