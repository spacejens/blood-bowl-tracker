import { Module } from '@nestjs/common';

import { TrophiesService } from './trophies.service';
import { TrophyRuleCurationSyncService } from './trophy-rule-curation-sync.service';

@Module({
  providers: [TrophiesService, TrophyRuleCurationSyncService],
  exports: [TrophiesService],
})
export class TrophiesModule {}
