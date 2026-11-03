import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { StarPlayerCharacteristicsModule } from '../star-player-characteristics/characteristics.module';
import { StarPlayerIdentityModule } from '../star-player-identity/identity.module';
import { StarPlayerKeywordsModule } from '../star-player-keywords/star-player-keywords.module';
import { StarPlayerSkillsModule } from '../star-player-skills/star-player-skills.module';
import { StarPlayerReviewerService } from './star-player-reviewer.service';

/**
 * The star-player panel pair: one reviewer stacking the identity,
 * characteristics, starting-skill and keyword renderers its four aspect
 * modules export.
 */
@Module({
  imports: [
    SharedModule,
    StarPlayerIdentityModule,
    StarPlayerCharacteristicsModule,
    StarPlayerSkillsModule,
    StarPlayerKeywordsModule,
  ],
  providers: [StarPlayerReviewerService],
  exports: [StarPlayerReviewerService],
})
export class StarPlayerModule {}
