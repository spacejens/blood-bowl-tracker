import type { FactScope } from '@blood-bowl-tracker/game-data';
import { TrophiesService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { TROPHY_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { EntityComponentsService } from '../../entity-components.service';
import {
  TROPHIES_LIST_NO_DATA_MESSAGE,
  TROPHIES_LIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { ListDescriptionService } from '../../shared/list-description.service';

interface TrophyEntry {
  id: number;
  name: string;
  competitionGroupId: number | null;
  competitionGroupName: string | null;
  leagueId: number | null;
  leagueName: string | null;
}

@Injectable()
export class TrophiesListService {
  constructor(
    private readonly trophies: TrophiesService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
    private readonly listDescription: ListDescriptionService,
  ) {}

  async resolve(scope: FactScope): Promise<string | InteractionReplyOptions> {
    const rows = await this.databaseTimeout.run(
      this.trophies.listAllWithLeague(scope),
      null,
    );
    if (rows === null) {
      return TROPHIES_LIST_TIMEOUT_MESSAGE;
    }
    if (rows.length === 0) {
      return {
        embeds: [
          { title: 'Trophies', description: TROPHIES_LIST_NO_DATA_MESSAGE },
        ],
      };
    }

    // Scope name first so trophies awarded under the same competition group
    // (or the same league) cluster together, then trophy name within. A
    // trophy carries exactly one of the two names, so whichever is present
    // is the sort key.
    const scopeName = (trophy: TrophyEntry): string =>
      trophy.competitionGroupName ?? trophy.leagueName ?? '';

    const ordered: TrophyEntry[] = rows
      .slice()
      .sort(
        (a, b) =>
          scopeName(a).localeCompare(scopeName(b)) ||
          a.name.localeCompare(b.name),
      );

    const lines = ordered.map(
      (trophy) => `${trophy.name} (${scopeName(trophy)})`,
    );

    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(
        ordered.map((trophy) => ({
          customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(trophy.id),
          label: trophy.name,
        })),
      );

    return {
      embeds: [
        {
          title: 'Trophies',
          description: this.listDescription.build(lines, overflowNote),
        },
      ],
      components,
    };
  }
}
