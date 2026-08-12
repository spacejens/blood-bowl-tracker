import { CoachesService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_COACH_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_ERAS_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_NO_MATCHES_MESSAGE,
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COACH_TEAM_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  LeaderboardService,
  MAX_LEADERBOARD_ENTRIES,
} from '../../insights/leaderboard.service';
import { TeamContextService } from '../../insights/team-context.service';
import {
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

type Coach = { id: number; name: string };
type CareerSpan = { start: string; end: string };
type TopTeam = { id: number; name: string; count: number };
type Era = { id: number; name: string };

/** Position at which the top-teams list opens a tie group (5th place). */
const TOP_TEAMS_TOP_ENTRIES = 5;

/**
 * Composes the coach header (eras), career span, and top-teams list into a
 * single embed. Shared by `/deepdive coach:<id>` and the coach deepdive
 * buttons. Each DB call is wrapped in `databaseTimeout.run` with a `null`
 * sentinel so a timeout is distinguishable from a genuine "not found" / "no
 * matches" (`undefined`).
 */
@Injectable()
export class CoachDeepdiveService {
  constructor(
    private readonly coaches: CoachesService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly leaderboard: LeaderboardService,
    private readonly entityComponents: EntityComponentsService,
    private readonly teamContext: TeamContextService,
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

    const eraRows: Era[] | null = await this.databaseTimeout.run(
      this.coaches.listEras(coachId),
      null,
    );
    if (eraRows === null) {
      return DEEPDIVE_COACH_ERAS_TIMEOUT_MESSAGE;
    }
    const eraNames =
      eraRows.length > 0
        ? eraRows.map((era) => era.name).join(', ')
        : 'None recorded';
    const headerEntries: EntityComponentEntry[] = eraRows.map((era) => ({
      customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
      entityId: String(era.id),
      label: era.name,
    }));

    const span: CareerSpan | undefined | null = await this.databaseTimeout.run(
      this.coaches.getCareerSpan(coachId),
      null,
    );
    if (span === null) {
      return DEEPDIVE_COACH_CAREER_TIMEOUT_MESSAGE;
    }
    if (span === undefined) {
      const { components, overflowNote } =
        this.entityComponents.buildEntityComponents(headerEntries);
      return {
        embeds: [
          {
            title: coach.name,
            description: [
              `Eras: ${eraNames}`,
              DEEPDIVE_COACH_NO_MATCHES_MESSAGE,
              ...(overflowNote === null ? [] : [overflowNote]),
            ].join('\n'),
          },
        ],
        ...(components.length > 0 ? { components } : {}),
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
    // The list is already scoped to this one coach, so only the race adds
    // information; the coach half would repeat on every row. Wrapped in the
    // same timeout handling as every other DB call in this method, since
    // attachSuffixes does its own DB round trip.
    const decorated:
      (TopTeam & { rank: number; contextSuffix: string })[] | null =
      await this.databaseTimeout.run(
        this.teamContext.attachSuffixes(ranked, (row) => row.id, {
          includeRace: true,
          includeCoach: false,
        }),
        null,
      );
    if (decorated === null) {
      return DEEPDIVE_COACH_TEAM_CONTEXT_TIMEOUT_MESSAGE;
    }
    const teamLines = decorated.map(
      (row) => `${row.rank}. ${row.name}${row.contextSuffix} — ${row.count}`,
    );
    if (truncatedCount > 0) {
      teamLines.push(`…and ${truncatedCount} more tied.`);
    }

    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents([
        ...headerEntries,
        ...ranked.map((row): EntityComponentEntry => ({
          customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(row.id),
          label: row.name,
        })),
      ]);

    const description = [
      `Eras: ${eraNames}`,
      `Career: ${span.start} – ${span.end}`,
      '',
      'Top teams by matches played:',
      ...teamLines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [{ title: coach.name, description }],
      ...(components.length > 0 ? { components } : {}),
    };
  }
}
