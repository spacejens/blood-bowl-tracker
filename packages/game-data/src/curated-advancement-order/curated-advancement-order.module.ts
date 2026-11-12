import { Module } from '@nestjs/common';

import { CuratedAdvancementOrderMatcherService } from '../player-skills/curated-advancement-order-matcher.service';
import { PlayerSkillsModule } from '../player-skills/player-skills.module';
import { SppModule } from '../spp/spp.module';
import { CuratedAdvancementOrderService } from './curated-advancement-order.service';

@Module({
  imports: [PlayerSkillsModule, SppModule],
  providers: [
    CuratedAdvancementOrderService,
    CuratedAdvancementOrderMatcherService,
  ],
  exports: [CuratedAdvancementOrderService],
})
export class CuratedAdvancementOrderModule {}
