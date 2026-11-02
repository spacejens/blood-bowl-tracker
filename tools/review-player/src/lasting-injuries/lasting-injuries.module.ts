import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { BblLastingInjuriesRawRendererService } from './bbl-lasting-injuries-raw-renderer.service';
import { CurrentInjuryStratificationService } from './current-injury-stratification.service';
import { HealedInjuryStratificationService } from './healed-injury-stratification.service';
import { LastingInjuriesDbRendererService } from './lasting-injuries-db-renderer.service';
import { TpLastingInjuriesRawRendererService } from './tp-lasting-injuries-raw-renderer.service';

/**
 * The lasting-injuries renderers of the career history (each source's own view
 * of what is outstanding, and the seven stored columns) and two strata —
 * players who currently carry an injury, and players whose injury has since
 * healed (this codebase's first reader of a `*_history` table).
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    BblLastingInjuriesRawRendererService,
    CurrentInjuryStratificationService,
    HealedInjuryStratificationService,
    LastingInjuriesDbRendererService,
    TpLastingInjuriesRawRendererService,
  ],
  exports: [
    BblLastingInjuriesRawRendererService,
    CurrentInjuryStratificationService,
    HealedInjuryStratificationService,
    LastingInjuriesDbRendererService,
    TpLastingInjuriesRawRendererService,
  ],
})
export class LastingInjuriesModule {}
