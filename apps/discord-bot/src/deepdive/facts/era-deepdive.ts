import type {
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
} from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import { withDatabaseTimeout } from '../../database-timeout';
import {
  DEEPDIVE_COMPETITIONS_TIMEOUT_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_TIMEOUT_MESSAGE,
  DEEPDIVE_EXTERNAL_SYSTEMS_TIMEOUT_MESSAGE,
  DEEPDIVE_NO_COMPETITIONS_MESSAGE,
  DEEPDIVE_RULES_SET_TIMEOUT_MESSAGE,
} from '../../error-messages';

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
 * deepdive buttons. Each DB call is wrapped in `withDatabaseTimeout` with a
 * `null` sentinel so a timeout is distinguishable from a genuine "not found"
 * (`undefined`).
 */
export async function resolveEraDeepdive(
  eraId: number,
  services: {
    eras: ErasService;
    competitions: CompetitionsService;
    externalSystems: ExternalSystemsService;
  },
): Promise<string | InteractionReplyOptions> {
  const { eras, competitions, externalSystems } = services;

  const era: EraHeader | undefined | null = await withDatabaseTimeout(
    eras.findByIdWithLeague(eraId),
    null,
  );
  if (era === null) {
    return DEEPDIVE_ERA_TIMEOUT_MESSAGE;
  }
  if (era === undefined) {
    return DEEPDIVE_ERA_NOT_FOUND_MESSAGE;
  }

  const rulesSetNames: string[] | null = await withDatabaseTimeout(
    eras.getRulesSetNames(eraId),
    null,
  );
  if (rulesSetNames === null) {
    return DEEPDIVE_RULES_SET_TIMEOUT_MESSAGE;
  }

  const comps: Competition[] | null = await withDatabaseTimeout(
    competitions.listByEraChronological(eraId),
    null,
  );
  if (comps === null) {
    return DEEPDIVE_COMPETITIONS_TIMEOUT_MESSAGE;
  }

  const externalSystemNames: string[] | null = await withDatabaseTimeout(
    externalSystems.listNamesByEra(eraId),
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

  return { embeds: [{ title: era.name, description }] };
}
