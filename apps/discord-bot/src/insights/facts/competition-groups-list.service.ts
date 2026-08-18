import type { FactScope } from '@blood-bowl-tracker/game-data';
import { CompetitionGroupsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { EntityComponentsService } from '../../entity-components.service';
import {
  COMPETITION_GROUPS_LIST_NO_DATA_MESSAGE,
  COMPETITION_GROUPS_LIST_TIMEOUT_MESSAGE,
} from '../../error-messages';

interface CompetitionGroupEntry {
  id: number;
  name: string;
  leagueName: string;
  competitionCount: number;
}

@Injectable()
export class CompetitionGroupsListService {
  constructor(
    private readonly competitionGroups: CompetitionGroupsService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
  ) {}

  async resolve(scope: FactScope): Promise<string | InteractionReplyOptions> {
    const rows = await this.databaseTimeout.run(
      this.competitionGroups.listAllWithLeagueAndCount(scope),
      null,
    );
    if (rows === null) {
      return COMPETITION_GROUPS_LIST_TIMEOUT_MESSAGE;
    }
    if (rows.length === 0) {
      return {
        embeds: [
          {
            title: 'Competition groups',
            description: COMPETITION_GROUPS_LIST_NO_DATA_MESSAGE,
          },
        ],
      };
    }

    const ordered: CompetitionGroupEntry[] = rows
      .slice()
      .sort(
        (a, b) =>
          a.leagueName.localeCompare(b.leagueName) ||
          a.name.localeCompare(b.name),
      );

    const lines = ordered.map(
      (group) =>
        `${group.name} (${group.leagueName}): ${group.competitionCount} competition${
          group.competitionCount === 1 ? '' : 's'
        }`,
    );

    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(
        ordered.map((group) => ({
          customIdPrefix: COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(group.id),
          label: group.name,
        })),
      );
    if (overflowNote !== null) {
      lines.push(overflowNote);
    }

    return {
      embeds: [{ title: 'Competition groups', description: lines.join('\n') }],
      components,
    };
  }
}
