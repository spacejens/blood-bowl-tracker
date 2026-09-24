import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { TpMissingTrophyAwardsImportService } from './tp-missing-trophy-awards-import.service';

@Module({
  imports: [ImportModule],
  providers: [TpMissingTrophyAwardsImportService],
  exports: [TpMissingTrophyAwardsImportService],
})
export class TrophyAwardsModule {}
