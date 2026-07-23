import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { TeamsService } from './teams.service';

@Module({
  imports: [LikePatternModule],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
