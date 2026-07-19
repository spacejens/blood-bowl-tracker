import type { CoachesService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import { withDatabaseTimeout } from '../../database-timeout';
import {
  DEEPDIVE_COACH_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_NO_MATCHES_MESSAGE,
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COACH_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  MAX_LEADERBOARD_ENTRIES,
  topRanksWithTies,
} from '../../insights/leaderboard';

type Coach = { id: number; name: string };
type CareerSpan = { start: string; end: string };
type TopTeam = { name: string; count: number };

/** Position at which the top-teams list opens a tie group (5th place). */
const TOP_TEAMS_TOP_ENTRIES = 5;

/**
 * Composes the coach header, career span, and top-teams list into a single
 * embed. Shared by `/deepdive coach:<id>` and the coach deepdive buttons. Each
 * DB call is wrapped in `withDatabaseTimeout` with a `null` sentinel so a
 * timeout is distinguishable from a genuine "not found" / "no matches"
 * (`undefined`).
 */
export async function resolveCoachDeepdive(
  coachId: number,
  services: { coaches: CoachesService },
): Promise<string | InteractionReplyOptions> {
  const { coaches } = services;

  const coach: Coach | undefined | null = await withDatabaseTimeout(
    coaches.findById(coachId),
    null,
  );
  if (coach === null) {
    return DEEPDIVE_COACH_TIMEOUT_MESSAGE;
  }
  if (coach === undefined) {
    return DEEPDIVE_COACH_NOT_FOUND_MESSAGE;
  }

  const span: CareerSpan | undefined | null = await withDatabaseTimeout(
    coaches.getCareerSpan(coachId),
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

  const topTeams: TopTeam[] | null = await withDatabaseTimeout(
    coaches.getTopTeamsByMatchesPlayed(coachId, MAX_LEADERBOARD_ENTRIES),
    null,
  );
  if (topTeams === null) {
    return DEEPDIVE_COACH_TEAMS_TIMEOUT_MESSAGE;
  }

  const { rows: ranked, truncatedCount } = topRanksWithTies(
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
    'Top teams:',
    ...teamLines,
  ].join('\n');

  return { embeds: [{ title: coach.name, description }] };
}
