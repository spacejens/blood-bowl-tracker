import { CoachesService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  DEEPDIVE_COACH_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_NO_MATCHES_MESSAGE,
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COACH_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  LeaderboardService,
  MAX_LEADERBOARD_ENTRIES,
} from '../../insights/leaderboard.service';
import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../button-custom-ids';

type Coach = { id: number; name: string };
type CareerSpan = { start: string; end: string };
type TopTeam = { id: number; name: string; count: number };

/** Position at which the top-teams list opens a tie group (5th place). */
const TOP_TEAMS_TOP_ENTRIES = 5;

/**
 * Composes the coach header, career span, and top-teams list into a single
 * embed. Shared by `/deepdive coach:<id>` and the coach deepdive buttons. Each
 * DB call is wrapped in `databaseTimeout.run` with a `null` sentinel so a
 * timeout is distinguishable from a genuine "not found" / "no matches"
 * (`undefined`).
 */
@Injectable()
export class CoachDeepdiveService {
  constructor(
    private readonly coaches: CoachesService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  async resolve(coachId: number): Promise<string | InteractionReplyOptions> {
    const coach: Coach | undefined | null = await this.databaseTimeout.run(
      this.coaches.findById(coachId),
      null,
    );
    if (coach === null) {
      return DEEPDIVE_COACH_TIMEOUT_MESSAGE;
    }
    if (coach === undefined) {
      return DEEPDIVE_COACH_NOT_FOUND_MESSAGE;
    }

    const span: CareerSpan | undefined | null = await this.databaseTimeout.run(
      this.coaches.getCareerSpan(coachId),
      null,
    );
    if (span === null) {
      return DEEPDIVE_COACH_CAREER_TIMEOUT_MESSAGE;
    }
    if (span === undefined) {
      return {
        embeds: [
          { title: coach.name, description: DEEPDIVE_COACH_NO_MATCHES_MESSAGE },
        ],
      };
    }

    const topTeams: TopTeam[] | null = await this.databaseTimeout.run(
      this.coaches.getTopTeamsByMatchesPlayed(coachId, MAX_LEADERBOARD_ENTRIES),
      null,
    );
    if (topTeams === null) {
      return DEEPDIVE_COACH_TEAMS_TIMEOUT_MESSAGE;
    }

    const { rows: ranked, truncatedCount } = this.leaderboard.topRanksWithTies(
      topTeams,
      TOP_TEAMS_TOP_ENTRIES,
    );
    const teamLines = ranked.map(
      (row) => `${row.rank}. ${row.name} — ${row.count}`,
    );
    if (truncatedCount > 0) {
      teamLines.push(`…and ${truncatedCount} more tied.`);
    }

    const description = [
      `Career: ${span.start} – ${span.end}`,
      '',
      'Top teams by matches played:',
      ...teamLines,
    ].join('\n');

    const components = this.leaderboard.buildEntityButtons(
      ranked,
      (row) => `${TEAM_BUTTON_CUSTOM_ID_PREFIX}${row.id}`,
      (row) => row.name,
    );

    return {
      embeds: [{ title: coach.name, description }],
      ...(components.length > 0 ? { components } : {}),
    };
  }
}
