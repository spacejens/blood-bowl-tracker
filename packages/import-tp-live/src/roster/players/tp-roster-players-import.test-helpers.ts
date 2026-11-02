import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { Player } from '@blood-bowl-tracker/db';
import { PlayersService } from '@blood-bowl-tracker/game-data';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import type { TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  rosterContext,
  rosterPlayer,
  tpRoster,
} from '../tp-roster.test-helpers';
import { TpCharacteristicIncreasesService } from './tp-characteristic-increases.service';
import { TpLastingInjuryBuilderService } from './tp-lasting-injury-builder.service';
import { TpMercenaryCharacteristicsService } from './tp-mercenary-characteristics.service';
import { TpPlayerCharacteristicsBuilderService } from './tp-player-characteristics-builder.service';
import { TpPlayerPositionService } from './tp-player-position.service';
import { TpPlayerStatusService } from './tp-player-status.service';
import type { TpRosterPlayersOutcome } from './tp-roster-players-import.service';
import { TpRosterPlayersImportService } from './tp-roster-players-import.service';

export const TEAM_ERA_ID = 31;

/** The subject's mocked collaborators. */
export interface PlayersImportMocks {
  positions: MockProxy<TpPlayerPositionService>;
  players: MockProxy<PlayersService>;
  mercenaryCharacteristics: MockProxy<TpMercenaryCharacteristicsService>;
  lastingInjuries: MockProxy<TpLastingInjuryBuilderService>;
  increases: MockProxy<TpCharacteristicIncreasesService>;
  status: MockProxy<TpPlayerStatusService>;
}

/**
 * Builds the subject with every player resolving to position 11 and every
 * upsert inserting player `700 + n`, unless `configure` overrides a mock.
 */
export async function buildPlayersImport(
  configure: (m: PlayersImportMocks) => void = () => undefined,
): Promise<{
  service: TpRosterPlayersImportService;
  mocks: PlayersImportMocks;
}> {
  const mocks: PlayersImportMocks = {
    positions: mock<TpPlayerPositionService>(),
    players: mock<PlayersService>(),
    mercenaryCharacteristics: mock<TpMercenaryCharacteristicsService>(),
    lastingInjuries: mock<TpLastingInjuryBuilderService>(),
    increases: mock<TpCharacteristicIncreasesService>(),
    status: mock<TpPlayerStatusService>(),
  };
  mocks.positions.resolveCatalogPositions.mockResolvedValue(
    new Map([[77, 11]]),
  );
  mocks.positions.forPlayer.mockResolvedValue({
    positionId: 11,
    mercenary: undefined,
  });
  let nextId = 700;
  mocks.players.upsert.mockImplementation(() =>
    Promise.resolve({
      player: mock<Player>({ id: nextId++ }),
      created: true,
    }),
  );
  mocks.increases.newCache.mockReturnValue({
    baselinesByPositionId: new Map(),
    reportedGaps: new Set(),
  });
  mocks.status.forPlayer.mockReturnValue(null);
  configure(mocks);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpRosterPlayersImportService,
      TpPlayerCharacteristicsBuilderService,
      ImportResultService,
      UpsertRecorderService,
      { provide: TpPlayerPositionService, useValue: mocks.positions },
      { provide: PlayersService, useValue: mocks.players },
      {
        provide: TpMercenaryCharacteristicsService,
        useValue: mocks.mercenaryCharacteristics,
      },
      {
        provide: TpLastingInjuryBuilderService,
        useValue: mocks.lastingInjuries,
      },
      {
        provide: TpCharacteristicIncreasesService,
        useValue: mocks.increases,
      },
      { provide: TpPlayerStatusService, useValue: mocks.status },
    ],
  }).compile();
  return { service: moduleRef.get(TpRosterPlayersImportService), mocks };
}

/** What one call of {@link runPlayersImport} varies. */
export interface RunPlayersImportOptions {
  players?: TpRosterPlayer[];
  embedded?: TpRosterPlayer[];
  context?: ReturnType<typeof rosterContext>;
  deferSppTotal?: boolean;
  errors: ImportError[];
}

/** Imports one roster (by default a single `rosterPlayer()`) into team era 31. */
export function runPlayersImport(
  service: TpRosterPlayersImportService,
  options: RunPlayersImportOptions,
): Promise<TpRosterPlayersOutcome> {
  return service.importPlayers({
    roster: tpRoster({ players: options.players ?? [rosterPlayer()] }),
    matchEmbeddedPlayers: options.embedded ?? [],
    context: options.context ?? rosterContext(),
    teamEraId: TEAM_ERA_ID,
    deferSppTotal: options.deferSppTotal,
    errors: options.errors,
  });
}
