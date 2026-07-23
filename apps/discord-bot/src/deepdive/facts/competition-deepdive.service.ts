import { CompetitionsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { LeaderboardService } from '../../insights/leaderboard.service';
import {
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

type CompetitionHeader = {
  id: number;
  name: string;
  type: 'season' | 'cup';
  eraId: number;
  eraName: string;
};
type ParticipatingTeam = { id: number; name: string };
type ButtonEntry = { customId: string; label: string };

/**
 * Composes the competition header (type), its era line, and its participating-
 * teams list into a single embed. Shared by `/deepdive competition:<id>` and
 * the competition deepdive buttons. Each DB call is wrapped in
 * `databaseTimeout.run` with a `null` sentinel so a timeout is distinguishable
 * from a genuine "not found" (`undefined`). The era (always present) and each
 * participating team are rendered as drill-down buttons in one combined pool,
 * era first.
 */
@Injectable()
export class CompetitionDeepdiveService {
  constructor(
    private readonly competitions: CompetitionsService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  async resolve(
    competitionId: number,
  ): Promise<string | InteractionReplyOptions> {
    const competition: CompetitionHeader | undefined | null =
      await this.databaseTimeout.run(
        this.competitions.findByIdWithEra(competitionId),
        null,
      );
    if (competition === null) {
      return DEEPDIVE_COMPETITION_TIMEOUT_MESSAGE;
    }
    if (competition === undefined) {
      return DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE;
    }

    const teams: ParticipatingTeam[] | null = await this.databaseTimeout.run(
      this.competitions.listTeams(competitionId),
      null,
    );
    if (teams === null) {
      return DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE;
    }

    const teamLines =
      teams.length > 0
        ? teams.map((team) => team.name)
        : [DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE];

    const description = [
      `Type: ${competition.type}`,
      `Era: ${competition.eraName}`,
      '',
      'Participating teams:',
      ...teamLines,
    ].join('\n');

    const buttonEntries: ButtonEntry[] = [
      {
        customId: `${ERA_BUTTON_CUSTOM_ID_PREFIX}${competition.eraId}`,
        label: competition.eraName,
      },
      ...teams.map((team) => ({
        customId: `${TEAM_BUTTON_CUSTOM_ID_PREFIX}${team.id}`,
        label: team.name,
      })),
    ];
    const components = this.leaderboard.buildEntityButtons(
      buttonEntries,
      (entry) => entry.customId,
      (entry) => entry.label,
    );

    return { embeds: [{ title: competition.name, description }], components };
  }
}
