import {
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  DEEPDIVE_COMPETITIONS_TIMEOUT_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_TIMEOUT_MESSAGE,
  DEEPDIVE_EXTERNAL_SYSTEMS_TIMEOUT_MESSAGE,
  DEEPDIVE_NO_COMPETITIONS_MESSAGE,
  DEEPDIVE_RULES_SET_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { COMPETITION_BUTTON_CUSTOM_ID_PREFIX } from '../button-custom-ids';

type EraHeader = {
  id: number;
  name: string;
  leagueName: string;
  startDate: string;
  endDate: string | null;
};

type Competition = {
  id: number;
  name: string;
  type: 'season' | 'cup';
};

/**
 * Composes the era header, its rules sets, and its chronological competition
 * list into a single embed. Shared by `/deepdive era:<id>` and the era
 * deepdive buttons. Each DB call is wrapped in `databaseTimeout.run` with a
 * `null` sentinel so a timeout is distinguishable from a genuine "not found"
 * (`undefined`).
 */
@Injectable()
export class EraDeepdiveService {
  constructor(
    private readonly eras: ErasService,
    private readonly competitions: CompetitionsService,
    private readonly externalSystems: ExternalSystemsService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  async resolve(eraId: number): Promise<string | InteractionReplyOptions> {
    const era: EraHeader | undefined | null = await this.databaseTimeout.run(
      this.eras.findByIdWithLeague(eraId),
      null,
    );
    if (era === null) {
      return DEEPDIVE_ERA_TIMEOUT_MESSAGE;
    }
    if (era === undefined) {
      return DEEPDIVE_ERA_NOT_FOUND_MESSAGE;
    }

    const rulesSetNames: string[] | null = await this.databaseTimeout.run(
      this.eras.getRulesSetNames(eraId),
      null,
    );
    if (rulesSetNames === null) {
      return DEEPDIVE_RULES_SET_TIMEOUT_MESSAGE;
    }

    const comps: Competition[] | null = await this.databaseTimeout.run(
      this.competitions.listByEraChronological(eraId),
      null,
    );
    if (comps === null) {
      return DEEPDIVE_COMPETITIONS_TIMEOUT_MESSAGE;
    }

    const externalSystemNames: string[] | null = await this.databaseTimeout.run(
      this.externalSystems.listNamesByEra(eraId),
      null,
    );
    if (externalSystemNames === null) {
      return DEEPDIVE_EXTERNAL_SYSTEMS_TIMEOUT_MESSAGE;
    }

    const end = era.endDate ?? 'present';
    const rules =
      rulesSetNames.length > 0 ? rulesSetNames.join(', ') : 'None recorded';
    const externalSystemsLine =
      externalSystemNames.length > 0
        ? externalSystemNames.join(', ')
        : 'None recorded';
    const competitionLines =
      comps.length > 0
        ? comps.map((comp) => `${comp.name} (${comp.type})`)
        : [DEEPDIVE_NO_COMPETITIONS_MESSAGE];

    const description = [
      `League: ${era.leagueName}`,
      `Dates: ${era.startDate} – ${end}`,
      `Rules: ${rules}`,
      `External systems: ${externalSystemsLine}`,
      '',
      ...competitionLines,
    ].join('\n');

    const components = this.leaderboard.buildEntityButtons(
      comps,
      (comp) => `${COMPETITION_BUTTON_CUSTOM_ID_PREFIX}${comp.id}`,
      (comp) => comp.name,
    );

    return {
      embeds: [{ title: era.name, description }],
      ...(components.length > 0 ? { components } : {}),
    };
  }
}
