import { MATCH_CATEGORIES } from '@blood-bowl-tracker/api-contract';
import {
  CompetitionsService,
  ErasService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import type { ResolvedScope } from '../slash-commands/insights-command.service';
import { MatchCategoryLabelService } from './facts/match-category-label.service';
import { RandomSourceService } from './random-source.service';

/** The filter dimensions a scheduled insight can be scoped to. */
const FILTER_DIMENSIONS = ['era', 'competition', 'match-category'] as const;

/**
 * Chooses the scope for one scheduled random insight: no filter at all, or
 * exactly one era, competition or match category.
 *
 * Era and competition scoping are additionally weighted towards ongoing eras
 * (those with no end date), because recent data is what channel members care
 * about most. Match categories have no "current" notion, so that second roll
 * does not apply to them.
 */
@Injectable()
export class RandomInsightsScopeService {
  constructor(
    private readonly config: DiscordBotConfigService,
    private readonly random: RandomSourceService,
    private readonly eras: ErasService,
    private readonly competitions: CompetitionsService,
    private readonly categoryLabel: MatchCategoryLabelService,
  ) {}

  /**
   * Forces the two percent-probability config getters this service depends
   * on to be read (and thus validated) eagerly. Called from
   * `RandomInsightsSchedulerService.onApplicationBootstrap()` so a missing or
   * invalid value fails startup immediately, rather than lazily on the first
   * `pickScope()` call -- where it would be swallowed by that caller's
   * per-tick error handling instead of crashing the process.
   */
  validateConfig(): void {
    this.config.getRandomInsightsFilterProbability();
    this.config.getRandomInsightsFilterCurrentEraProbability();
  }

  async pickScope(): Promise<ResolvedScope> {
    if (
      !this.random.rollPercent(this.config.getRandomInsightsFilterProbability())
    ) {
      return {};
    }

    const dimension = this.random.pick(FILTER_DIMENSIONS);
    if (dimension === 'match-category') {
      const value = this.random.pick(MATCH_CATEGORIES);
      return {
        matchCategory: { value, label: this.categoryLabel.label(value) },
      };
    }

    const candidateEras = await this.pickCandidateEras();
    if (candidateEras.length === 0) {
      return {};
    }
    if (dimension === 'era') {
      const era = this.random.pick(candidateEras);
      return { era: { id: era.id, name: era.name } };
    }
    return this.pickCompetitionScope(candidateEras.map((era) => era.id));
  }

  /**
   * The eras a scope may be drawn from: only ongoing ones when the current-era
   * roll hits, otherwise all of them. When the roll hits but nothing is
   * ongoing, all eras are used rather than skipping filtering entirely.
   */
  private async pickCandidateEras(): Promise<{ id: number; name: string }[]> {
    const all = await this.eras.listErasWithLeague({});
    const preferCurrent = this.random.rollPercent(
      this.config.getRandomInsightsFilterCurrentEraProbability(),
    );
    const ongoing = all.filter((era) => era.endDate === null);
    return preferCurrent && ongoing.length > 0 ? ongoing : all;
  }

  /**
   * A competition belonging to one of the candidate eras. Falls back to an
   * unfiltered scope when there is none, since there is nothing to scope to.
   */
  private async pickCompetitionScope(eraIds: number[]): Promise<ResolvedScope> {
    const ids = new Set(eraIds);
    const candidates = (await this.competitions.listAllWithEraId()).filter(
      (competition) => ids.has(competition.eraId),
    );
    if (candidates.length === 0) {
      return {};
    }
    const competition = this.random.pick(candidates);
    return { competition: { id: competition.id, name: competition.name } };
  }
}
