import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { AdvancementsDbRendererService } from '../advancement-costs/advancements-db-renderer.service';
import { BblLastingInjuriesRawRendererService } from '../lasting-injuries/bbl-lasting-injuries-raw-renderer.service';
import { LastingInjuriesDbRendererService } from '../lasting-injuries/lasting-injuries-db-renderer.service';
import { TpLastingInjuriesRawRendererService } from '../lasting-injuries/tp-lasting-injuries-raw-renderer.service';
import { BblPlayerAdvancementsRawRendererService } from '../player-advancements/bbl-player-advancements-raw-renderer.service';
import { TpPlayerAdvancementsRawRendererService } from '../player-advancements/tp-player-advancements-raw-renderer.service';
import { BblPlayerCharacteristicsRawRendererService } from '../player-characteristics/bbl-player-characteristics-raw-renderer.service';
import { PlayerCharacteristicsDbRendererService } from '../player-characteristics/player-characteristics-db-renderer.service';
import { TpPlayerCharacteristicsRawRendererService } from '../player-characteristics/tp-player-characteristics-raw-renderer.service';
import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { SectionRenderService } from '../shared/section-render.service';
import { PlayerSppLookupService } from '../spp-totals/player-spp-lookup.service';
import { PlayerSppTotalsRendererService } from '../spp-totals/player-spp-totals-renderer.service';

/**
 * The career-history panel pair: how the player got where they are. SPP,
 * skills and advancements, characteristics, lasting injuries and unspent SPP
 * sit together because advancements, injuries and SPP spend all feed the
 * current characteristics.
 *
 * The raw panel reads whichever source the player was sampled through: its
 * SPP figures and one advancement list, then its characteristics and lasting
 * injuries. The imported panel opens with the SPP total, then the one
 * advancement table, characteristics against the position baseline and
 * lasting injuries, and closes with unspent SPP, which depends on all of them.
 */
@Injectable()
export class PlayerCareerHistoryReviewerService implements PlayerDataTypeReviewer {
  readonly id = 'career-history';

  constructor(
    private readonly bblAdvancements: BblPlayerAdvancementsRawRendererService,
    private readonly tpAdvancements: TpPlayerAdvancementsRawRendererService,
    private readonly bblCharacteristics: BblPlayerCharacteristicsRawRendererService,
    private readonly tpCharacteristics: TpPlayerCharacteristicsRawRendererService,
    private readonly bblInjuries: BblLastingInjuriesRawRendererService,
    private readonly tpInjuries: TpLastingInjuriesRawRendererService,
    private readonly sppLookup: PlayerSppLookupService,
    private readonly sppTotals: PlayerSppTotalsRendererService,
    private readonly advancements: AdvancementsDbRendererService,
    private readonly characteristics: PlayerCharacteristicsDbRendererService,
    private readonly injuries: LastingInjuriesDbRendererService,
    private readonly html: HtmlService,
    private readonly sections: SectionRenderService,
  ) {}

  async getRawSource(player: SampledPlayer): Promise<string> {
    const id = player.externalId;
    const bbl = player.source === 'bbl';
    const advancements = await this.sections.render(() =>
      bbl ? this.bblAdvancements.render(id) : this.tpAdvancements.render(id),
    );
    const characteristics = await this.sections.render(() =>
      bbl
        ? this.bblCharacteristics.render(id)
        : this.tpCharacteristics.render(id),
    );
    const injuries = await this.sections.render(() =>
      bbl ? this.bblInjuries.render(id) : this.tpInjuries.render(id),
    );
    return (
      advancements +
      this.html.subheading('Characteristics') +
      characteristics +
      this.html.subheading('Lasting injuries') +
      injuries
    );
  }

  async getImportedView(player: SampledPlayer): Promise<string> {
    const spp = await this.sections.render(async () =>
      this.sppTotals.render(await this.sppLookup.load(player)),
    );
    const [advancements, unspentSpp] = await this.sections.renderPair(
      async () => {
        const rendered = await this.advancements.render(player);
        return [rendered.advancements, rendered.unspentSpp] as const;
      },
    );
    const characteristics = await this.sections.render(() =>
      this.characteristics.render(player),
    );
    const injuries = await this.sections.render(() =>
      this.injuries.render(player),
    );
    return (
      this.html.subheading('SPP total') +
      spp +
      advancements +
      this.html.subheading('Characteristics (against position baseline)') +
      characteristics +
      this.html.subheading('Lasting injuries') +
      injuries +
      unspentSpp
    );
  }
}
