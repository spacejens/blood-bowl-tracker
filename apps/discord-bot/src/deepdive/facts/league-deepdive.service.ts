import {
  CompetitionGroupsService,
  LeaguesService,
  TrophiesService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_LEAGUE_COMPETITION_GROUPS_TIMEOUT_MESSAGE,
  DEEPDIVE_LEAGUE_NO_COMPETITION_GROUPS_MESSAGE,
  DEEPDIVE_LEAGUE_NO_TROPHIES_MESSAGE,
  DEEPDIVE_LEAGUE_NOT_FOUND_MESSAGE,
  DEEPDIVE_LEAGUE_TIMEOUT_MESSAGE,
  DEEPDIVE_LEAGUE_TROPHIES_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
  LEAGUE_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

type LeagueHeader = { id: number; name: string };
type NamedEntity = { id: number; name: string };

/**
 * Composes one league's header, the trophies it awards across all of its
 * competitions, and the recurring competition groups it runs. Shared by
 * `/deepdive league:<id>` and the league deepdive buttons. Each DB call is
 * wrapped in `databaseTimeout.run` with a `null` sentinel so a timeout is
 * distinguishable from a genuine "not found" (`undefined`), mirroring
 * `CompetitionGroupDeepdiveService`.
 *
 * Only trophies scoped directly to the league appear here — a trophy tied to
 * one of the league's competition groups belongs on that group's own
 * deepdive, which this one links to.
 *
 * Competition group entries come before trophy entries in the drill-down pool
 * because the groups are this deepdive's primary content, and
 * `buildEntityComponents` has no internal prioritisation: first entries win
 * the components budget.
 */
@Injectable()
export class LeagueDeepdiveService {
  constructor(
    private readonly leagues: LeaguesService,
    private readonly competitionGroups: CompetitionGroupsService,
    private readonly trophies: TrophiesService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
  ) {}

  async resolve(leagueId: number): Promise<string | InteractionReplyOptions> {
    const league: LeagueHeader | undefined | null =
      await this.databaseTimeout.run(this.leagues.findById(leagueId), null);
    if (league === null) {
      return DEEPDIVE_LEAGUE_TIMEOUT_MESSAGE;
    }
    if (league === undefined) {
      return DEEPDIVE_LEAGUE_NOT_FOUND_MESSAGE;
    }

    const leagueTrophies: NamedEntity[] | null = await this.databaseTimeout.run(
      this.trophies.listByLeague(leagueId),
      null,
    );
    if (leagueTrophies === null) {
      return DEEPDIVE_LEAGUE_TROPHIES_TIMEOUT_MESSAGE;
    }

    const groups: NamedEntity[] | null = await this.databaseTimeout.run(
      this.competitionGroups.listByLeague(leagueId),
      null,
    );
    if (groups === null) {
      return DEEPDIVE_LEAGUE_COMPETITION_GROUPS_TIMEOUT_MESSAGE;
    }

    const trophyLines =
      leagueTrophies.length > 0
        ? leagueTrophies.map((trophy) => trophy.name)
        : [DEEPDIVE_LEAGUE_NO_TROPHIES_MESSAGE];
    const groupLines =
      groups.length > 0
        ? groups.map((group) => group.name)
        : [DEEPDIVE_LEAGUE_NO_COMPETITION_GROUPS_MESSAGE];

    const entries: EntityComponentEntry[] = [
      ...groups.map((group): EntityComponentEntry => ({
        customIdPrefix: COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(group.id),
        label: group.name,
      })),
      ...leagueTrophies.map((trophy): EntityComponentEntry => ({
        customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(trophy.id),
        label: trophy.name,
      })),
    ];
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(entries);

    const description = [
      'Trophies:',
      ...trophyLines,
      '',
      'Competitions:',
      ...groupLines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [
        {
          title: `${this.entityComponents.getEmojiForPrefix(LEAGUE_BUTTON_CUSTOM_ID_PREFIX)} ${league.name}`,
          description,
        },
      ],
      ...(components.length > 0 ? { components } : {}),
    };
  }
}
