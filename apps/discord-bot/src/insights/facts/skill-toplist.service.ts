import type {
  FactScope,
  SkillPlayerCount,
} from '@blood-bowl-tracker/game-data';
import { SkillsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import {
  SKILL_TOPLIST_NO_DATA_MESSAGE,
  SKILL_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { LeaderboardService } from '../leaderboard.service';

/**
 * The `skill.toplist.players.*` facts: skills ranked by how many players hold
 * them, split by how the skill was acquired.
 *
 * Hand-written like RaceToplistService and StarPlayerToplistService rather than
 * assembled through ToplistFactoryService: the four resolvers differ only in
 * title and backing query, which one private helper says more directly than a
 * factory table would.
 *
 * No `entityLink`: skills have no `/deepdive` view to drill into, so there is
 * nothing for a per-row button to open. No `formatRow` either - a skill name
 * needs no contextual suffix (unlike a position, whose name repeats across
 * races), so the leaderboard's default `rank. name - count` line is right.
 */
@Injectable()
export class SkillToplistService {
  constructor(
    private readonly skills: SkillsService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  private resolveSkillToplist(options: {
    title: string;
    fetchRows: (limit: number) => Promise<SkillPlayerCount[]>;
  }): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<SkillPlayerCount>({
      title: options.title,
      fetchRows: options.fetchRows,
      timeoutMessage: SKILL_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: SKILL_TOPLIST_NO_DATA_MESSAGE,
    });
  }

  /** Every skill a player currently has, starting skills included. */
  resolveAny(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.resolveSkillToplist({
      title: 'Skills by players who have them',
      fetchRows: (limit) => this.skills.countPlayersBySkillAny(scope, limit),
    });
  }

  /**
   * Skills gained via advancement of any kind - chosen, randomly rolled, or a
   * source that only records "gained" without saying how.
   */
  resolveAdvancementAny(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveSkillToplist({
      title: 'Skills by players who gained them as an advancement',
      fetchRows: (limit) =>
        this.skills.countPlayersBySkillAdvancement(scope, limit),
    });
  }

  /** Skills gained as a freely chosen advancement. */
  resolveAdvancementChosen(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveSkillToplist({
      title: 'Skills by players who chose them as an advancement',
      fetchRows: (limit) => this.skills.countPlayersBySkillChosen(scope, limit),
    });
  }

  /** Skills gained as a randomly rolled advancement. */
  resolveAdvancementRandom(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveSkillToplist({
      title: 'Skills by players who had them randomly rolled as an advancement',
      fetchRows: (limit) => this.skills.countPlayersBySkillRandom(scope, limit),
    });
  }
}
