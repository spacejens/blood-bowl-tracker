import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { CoachDeepdiveService } from '../deepdive/facts/coach-deepdive.service';
import { CompetitionDeepdiveService } from '../deepdive/facts/competition-deepdive.service';
import { CompetitionGroupDeepdiveService } from '../deepdive/facts/competition-group-deepdive.service';
import { EraDeepdiveService } from '../deepdive/facts/era-deepdive.service';
import { LeagueDeepdiveService } from '../deepdive/facts/league-deepdive.service';
import { PlayerDeepdiveService } from '../deepdive/facts/player-deepdive.service';
import { RaceDeepdiveService } from '../deepdive/facts/race-deepdive.service';
import { StarPlayerDeepdiveService } from '../deepdive/facts/star-player-deepdive.service';
import { TeamDeepdiveService } from '../deepdive/facts/team-deepdive.service';
import { TrophyDeepdiveService } from '../deepdive/facts/trophy-deepdive.service';
import {
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_LEAGUE_NOT_FOUND_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
} from '../error-messages';

/**
 * Turns a raw `/deepdive` target value — a slash-command option, a button
 * customId's id part, or a select menu's chosen value — into the rendered
 * deepdive for that target.
 *
 * Split out of `DeepdiveCommandService` for the same reason
 * `DeepdiveAutocompleteService` was: that file was at the repo's 500-line
 * ceiling. This half depends only on the deepdive fact resolvers, the other
 * half only on the Discord command/interaction plumbing.
 *
 * Every target parses its value the same way, through `resolveTarget`: a
 * non-integer is rejected up front with that target's not-found message,
 * before any database lookup, since an unguarded `NaN` would reach the query
 * layer and make Postgres reject the query.
 */
@Injectable()
export class DeepdiveTargetResolverService {
  constructor(
    private readonly eraDeepdive: EraDeepdiveService,
    private readonly coachDeepdive: CoachDeepdiveService,
    private readonly teamDeepdive: TeamDeepdiveService,
    private readonly playerDeepdive: PlayerDeepdiveService,
    private readonly raceDeepdive: RaceDeepdiveService,
    private readonly competitionDeepdive: CompetitionDeepdiveService,
    private readonly competitionGroupDeepdive: CompetitionGroupDeepdiveService,
    private readonly trophyDeepdive: TrophyDeepdiveService,
    private readonly starPlayerDeepdive: StarPlayerDeepdiveService,
    private readonly leagueDeepdive: LeagueDeepdiveService,
  ) {}

  resolveEra(value: string): Promise<string | InteractionReplyOptions> {
    return this.resolveTarget(value, DEEPDIVE_ERA_NOT_FOUND_MESSAGE, (id) =>
      this.eraDeepdive.resolve(id),
    );
  }

  resolveCoach(value: string): Promise<string | InteractionReplyOptions> {
    return this.resolveTarget(value, DEEPDIVE_COACH_NOT_FOUND_MESSAGE, (id) =>
      this.coachDeepdive.resolve(id),
    );
  }

  resolveTeam(value: string): Promise<string | InteractionReplyOptions> {
    return this.resolveTarget(value, DEEPDIVE_TEAM_NOT_FOUND_MESSAGE, (id) =>
      this.teamDeepdive.resolve(id),
    );
  }

  resolvePlayer(value: string): Promise<string | InteractionReplyOptions> {
    return this.resolveTarget(value, DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE, (id) =>
      this.playerDeepdive.resolve(id),
    );
  }

  /**
   * The id here is a `positions.id` — a star's identity — not a `players.id`,
   * which is why it has its own resolver rather than sharing `resolvePlayer`.
   */
  resolveStarPlayer(value: string): Promise<string | InteractionReplyOptions> {
    return this.resolveTarget(
      value,
      DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
      (id) => this.starPlayerDeepdive.resolve(id),
    );
  }

  resolveRace(value: string): Promise<string | InteractionReplyOptions> {
    return this.resolveTarget(value, DEEPDIVE_RACE_NOT_FOUND_MESSAGE, (id) =>
      this.raceDeepdive.resolve(id),
    );
  }

  resolveCompetition(value: string): Promise<string | InteractionReplyOptions> {
    return this.resolveTarget(
      value,
      DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
      (id) => this.competitionDeepdive.resolve(id),
    );
  }

  resolveTrophy(value: string): Promise<string | InteractionReplyOptions> {
    return this.resolveTarget(value, DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE, (id) =>
      this.trophyDeepdive.resolve(id),
    );
  }

  resolveCompetitionGroup(
    value: string,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveTarget(
      value,
      DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE,
      (id) => this.competitionGroupDeepdive.resolve(id),
    );
  }

  resolveLeague(value: string): Promise<string | InteractionReplyOptions> {
    return this.resolveTarget(value, DEEPDIVE_LEAGUE_NOT_FOUND_MESSAGE, (id) =>
      this.leagueDeepdive.resolve(id),
    );
  }

  /**
   * Parses one target id and hands it to that target's fact service. Three
   * parameters exactly, which is the repo's `local/max-function-params`
   * ceiling — a fourth would have to become an options object.
   */
  private resolveTarget(
    value: string,
    notFoundMessage: string,
    resolve: (id: number) => Promise<string | InteractionReplyOptions>,
  ): Promise<string | InteractionReplyOptions> {
    const id = Number(value);
    if (!Number.isInteger(id)) {
      return Promise.resolve(notFoundMessage);
    }
    return resolve(id);
  }
}
