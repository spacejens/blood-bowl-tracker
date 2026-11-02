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
  ) {}

  async getRawSource(player: SampledPlayer): Promise<string> {
    const id = player.externalId;
    const bbl = player.source === 'bbl';
    const info = bbl
      ? await this.bblInfo.render(id)
      : await this.tpInfo.render(id);
    const status = bbl
      ? await this.bblStatus.render(id)
      : await this.tpStatus.render(id);
    return (
      this.html.subheading('Identity') +
      info +
      this.html.subheading('Status') +
      status +
      this.html.subheading('Keywords (TP template codes and manual curation)') +
      (await this.rawKeywords.render(player))
    );
  }

  async getImportedView(player: SampledPlayer): Promise<string> {
    return (
      this.html.subheading('Identity') +
      (await this.dbInfo.render(player)) +
      this.html.subheading('Status') +
      (await this.dbStatus.render(player)) +
      this.html.subheading('Position keywords') +
      (await this.dbKeywords.render(player))
    );
  }
}
