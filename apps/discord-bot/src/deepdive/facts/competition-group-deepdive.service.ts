import {
  CompetitionGroupsService,
  CompetitionsService,
  TrophiesService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_COMPETITION_GROUP_COMPETITIONS_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_NO_COMPETITIONS_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_NO_TROPHIES_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_TROPHIES_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { DateRangeFormatterService } from '../../shared/date-range-formatter.service';
import {
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

type CompetitionGroupHeader = {
  id: number;
  name: string;
  leagueId: number;
  leagueName: string;
};

type GroupTrophy = { id: number; name: string };

type GroupCompetition = {
  id: number;
  name: string;
  eraId: number;
  eraName: string;
  startDate: string;
  endDate: string | null;
};

/**
 * Composes one recurring competition group's header, the trophies it awards,
 * and every instance of it that has been run, oldest first. Shared by
 * `/deepdive competition-group:<id>` and the competition group deepdive
 * buttons. Each DB call is wrapped in `databaseTimeout.run` with a `null`
 * sentinel so a timeout is distinguishable from a genuine "not found"
 * (`undefined`). Competition entries come before trophy entries in the
 * drill-down pool because listing the instances is this deepdive's primary
 * job, and `buildEntityComponents` has no internal prioritisation — first
 * entries win the components budget.
 */
@Injectable()
export class CompetitionGroupDeepdiveService {
  constructor(
    private readonly competitionGroups: CompetitionGroupsService,
    private readonly trophies: TrophiesService,
    private readonly competitions: CompetitionsService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
    private readonly dateRangeFormatter: DateRangeFormatterService,
  ) {}

  async resolve(
    competitionGroupId: number,
  ): Promise<string | InteractionReplyOptions> {
    const group: CompetitionGroupHeader | undefined | null =
      await this.databaseTimeout.run(
        this.competitionGroups.findByIdWithLeague(competitionGroupId),
        null,
      );
    if (group === null) {
      return DEEPDIVE_COMPETITION_GROUP_TIMEOUT_MESSAGE;
    }
    if (group === undefined) {
      return DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE;
    }

    const groupTrophies: GroupTrophy[] | null = await this.databaseTimeout.run(
      this.trophies.listByCompetitionGroup(competitionGroupId),
      null,
    );
    if (groupTrophies === null) {
      return DEEPDIVE_COMPETITION_GROUP_TROPHIES_TIMEOUT_MESSAGE;
    }

    const comps: GroupCompetition[] | null = await this.databaseTimeout.run(
      this.competitions.listByCompetitionGroupChronological(competitionGroupId),
      null,
    );
    if (comps === null) {
      return DEEPDIVE_COMPETITION_GROUP_COMPETITIONS_TIMEOUT_MESSAGE;
    }

    const trophyLines =
      groupTrophies.length > 0
        ? groupTrophies.map((trophy) => trophy.name)
        : [DEEPDIVE_COMPETITION_GROUP_NO_TROPHIES_MESSAGE];
    const competitionLines =
      comps.length > 0
        ? comps.map(
            (comp) =>
              `${comp.name} (${comp.eraName}): ${this.dateRangeFormatter.format(comp.startDate, comp.endDate)}`,
          )
        : [DEEPDIVE_COMPETITION_GROUP_NO_COMPETITIONS_MESSAGE];

    const entries: EntityComponentEntry[] = [
      ...comps.map((comp): EntityComponentEntry => ({
        customIdPrefix: COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(comp.id),
        label: comp.name,
      })),
      ...groupTrophies.map((trophy): EntityComponentEntry => ({
        customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(trophy.id),
        label: trophy.name,
      })),
    ];
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(entries);

    const description = [
      `League: ${group.leagueName}`,
      '',
      'Trophies:',
      ...trophyLines,
      '',
      'Competitions:',
      ...competitionLines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [{ title: group.name, description }],
      ...(components.length > 0 ? { components } : {}),
    };
  }
}
