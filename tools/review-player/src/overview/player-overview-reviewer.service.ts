import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { BblPlayerInfoRawRendererService } from '../player-info/bbl-player-info-raw-renderer.service';
import { PlayerInfoDbRendererService } from '../player-info/player-info-db-renderer.service';
import { TpPlayerInfoRawRendererService } from '../player-info/tp-player-info-raw-renderer.service';
import { PlayerKeywordsDbRendererService } from '../player-keywords/player-keywords-db-renderer.service';
import { PlayerKeywordsRawRendererService } from '../player-keywords/player-keywords-raw-renderer.service';
import { BblPlayerStatusRawRendererService } from '../player-status/bbl-player-status-raw-renderer.service';
import { PlayerStatusDbRendererService } from '../player-status/player-status-db-renderer.service';
import { TpPlayerStatusRawRendererService } from '../player-status/tp-player-status-raw-renderer.service';
import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { SectionRenderService } from '../shared/section-render.service';

/**
 * The overview panel pair: who the player is. Each panel stacks identity,
 * status and keywords under their own subheadings, each rendered by that
 * aspect's own raw or database renderer. The raw panel reads whichever source
 * the player was sampled through, except keywords: only TP publishes keyword
 * codes, so that part reads TP for every player and its heading says so.
 */
@Injectable()
export class PlayerOverviewReviewerService implements PlayerDataTypeReviewer {
  readonly id = 'overview';

  constructor(
    private readonly bblInfo: BblPlayerInfoRawRendererService,
    private readonly tpInfo: TpPlayerInfoRawRendererService,
    private readonly dbInfo: PlayerInfoDbRendererService,
    private readonly bblStatus: BblPlayerStatusRawRendererService,
    private readonly tpStatus: TpPlayerStatusRawRendererService,
    private readonly dbStatus: PlayerStatusDbRendererService,
    private readonly rawKeywords: PlayerKeywordsRawRendererService,
    private readonly dbKeywords: PlayerKeywordsDbRendererService,
    private readonly html: HtmlService,
    private readonly sections: SectionRenderService,
  ) {}

  async getRawSource(player: SampledPlayer): Promise<string> {
    const id = player.externalId;
    const bbl = player.source === 'bbl';
    const info = await this.sections.render(() =>
      bbl ? this.bblInfo.render(id) : this.tpInfo.render(id),
    );
    const status = await this.sections.render(() =>
      bbl ? this.bblStatus.render(id) : this.tpStatus.render(id),
    );
    const keywords = await this.sections.render(() =>
      this.rawKeywords.render(player),
    );
    return (
      this.html.subheading('Identity') +
      info +
      this.html.subheading('Status') +
      status +
      this.html.subheading('Keywords (TP template codes and manual curation)') +
      keywords
    );
  }

  async getImportedView(player: SampledPlayer): Promise<string> {
    const info = await this.sections.render(() => this.dbInfo.render(player));
    const status = await this.sections.render(() =>
      this.dbStatus.render(player),
    );
    const keywords = await this.sections.render(() =>
      this.dbKeywords.render(player),
    );
    return (
      this.html.subheading('Identity') +
      info +
      this.html.subheading('Status') +
      status +
      this.html.subheading('Position keywords') +
      keywords
    );
  }
}
