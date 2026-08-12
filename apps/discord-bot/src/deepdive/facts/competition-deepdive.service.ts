import { CompetitionsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_TEAM_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { TeamContextService } from '../../insights/team-context.service';
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

/**
 * Composes the competition header (type), its era line, and its participating-
 * teams list into a single embed. Shared by `/deepdive competition:<id>` and
 * the competition deepdive buttons. Each DB call is wrapped in
 * `databaseTimeout.run` with a `null` sentinel so a timeout is distinguishable
 * from a genuine "not found" (`undefined`). The era (always present) and each
 * participating team are rendered as drill-down buttons in one combined pool,
 * teams first so they take component priority over the era header entry.
 */
@Injectable()
export class CompetitionDeepdiveService {
  constructor(
    private readonly competitions: CompetitionsService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
    private readonly teamContext: TeamContextService,
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

    // A competition is not scoped to one race or coach, so both add
    // information here. Wrapped in the same timeout handling as every other
    // DB call in this method, since attachSuffixes does its own DB round trip.
    const decorated: (ParticipatingTeam & { contextSuffix: string })[] | null =
      await this.databaseTimeout.run(
        this.teamContext.attachSuffixes(teams, (row) => row.id, {
          includeRace: true,
          includeCoach: true,
        }),
        null,
      );
    if (decorated === null) {
      return DEEPDIVE_COMPETITION_TEAM_CONTEXT_TIMEOUT_MESSAGE;
    }

    const teamLines =
      decorated.length > 0
        ? decorated.map((team) => `${team.name}${team.contextSuffix}`)
        : [DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE];

    const descriptionLines = [
      `Type: ${competition.type}`,
      `Era: ${competition.eraName}`,
      '',
      'Participating teams:',
      ...teamLines,
    ];

    // Team-list entries first: buildEntityComponents has no internal
    // prioritisation (first-N / first-group wins), so the participating-teams
    // list gets drill-down controls before the era header entry does.
    const entries: EntityComponentEntry[] = [
      ...teams.map((team): EntityComponentEntry => ({
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(team.id),
        label: team.name,
      })),
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(competition.eraId),
        label: competition.eraName,
      },
    ];
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(entries);
    const description = [
      ...descriptionLines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return { embeds: [{ title: competition.name, description }], components };
  }
}
