import { Module } from '@nestjs/common';

import { CompetitionEnrollmentService } from './competition-enrollment.service';
import { CompetitionsService } from './competitions.service';

@Module({
  providers: [CompetitionsService, CompetitionEnrollmentService],
  exports: [CompetitionsService],
})
export class CompetitionsModule {}
