import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { LeaguesService } from './leagues.service';

@Module({
  imports: [LikePatternModule],
  providers: [LeaguesService],
  exports: [LeaguesService],
})
export class LeaguesModule {}
