import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { StoredIncreaseRawMatchService } from '../player-advancements/stored-increase-raw-match.service';
import { StoredSkillRawMatchService } from '../player-advancements/stored-skill-raw-match.service';
import type { SampledPlayer } from '../shared/review.types';
import { AdvancementCostRangeService } from './advancement-cost-range.service';
import { AdvancementTableService } from './advancement-table.service';
import { PlayerAdvancementHistoryService } from './player-advancement-history.service';
import { SourceSpendComparisonService } from './source-spend-comparison.service';
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';
import { StoredUnspentSppCheckService } from './stored-unspent-spp-check.service';
import { UnspentSppTableService } from './unspent-spp-table.service';

/** The career history's two imported advancement parts, placed apart. */
export interface AdvancementsDbView {
  /** The one advancement table, or a note when the player has no row. */
  advancements: string;
  /** The unspent-SPP table; empty when the player has no row. */
  unspentSpp: string;
}

/**
 * What the importers stored about a player's advancements: the history is
 * priced by the cost model, each stored skill and increase is checked
 * against the raw source, and the result is rendered as the advancement
 * table and the unspent-SPP table. The two come back separately because the
 * career history places characteristics and lasting injuries between them.
 */
@Injectable()
export class AdvancementsDbRendererService {
  constructor(
    private readonly history: PlayerAdvancementHistoryService,
    private readonly range: AdvancementCostRangeService,
    private readonly figures: SourceUnspentSppFigureService,
    private readonly comparison: SourceSpendComparisonService,
    private readonly storedCheck: StoredUnspentSppCheckService,
    private readonly skillMatch: StoredSkillRawMatchService,
    private readonly increaseMatch: StoredIncreaseRawMatchService,
    private readonly advancementTable: AdvancementTableService,
    private readonly unspentTable: UnspentSppTableService,
    private readonly html: HtmlService,
  ) {}

  async render(player: SampledPlayer): Promise<AdvancementsDbView> {
    const history = (await this.history.forPlayers([player.playerId])).get(
      player.playerId,
    );
    if (history === undefined) {
      return {
        advancements: this.html.note(
          `No player row with id ${player.playerId} in the database.`,
        ),
        unspentSpp: '',
      };
    }
    const model = this.range.model(history);
    const figure = await this.figures.figureFor(player);
    const compared = this.comparison.compare(model, figure);
    const stored = this.storedCheck.check(
      model,
      history.storedUnspentSpp,
      figure,
    );
    return {
      advancements: this.advancementTable.render({
        model,
        skills: await this.skillMatch.match(player, history.skills),
        increases: await this.increaseMatch.match(player, history.increases),
      }),
      unspentSpp: this.unspentTable.render({
        model,
        figure,
        compared,
        stored,
        storedDisagrees: this.storedCheck.disagrees(stored),
      }),
    };
  }
}
