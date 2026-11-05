import { Module } from '@nestjs/common';

import { LikePatternModule } from '../shared/like-pattern.module';
import { CompetitionEnrollmentService } from './competition-enrollment.service';
import { CompetitionsService } from './competitions.service';

@Module({
  imports: [LikePatternModule],
  providers: [CompetitionsService, CompetitionEnrollmentService],
  exports: [CompetitionsService],
})
export class CompetitionsModule {}
