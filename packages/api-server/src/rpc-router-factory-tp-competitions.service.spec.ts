import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

describe('RpcRouterFactoryService tpCompetitions router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('imports one competition through TpCompetitionImportService, with its dates as dates', async () => {
    const one = { success: true, imported: 1, errors: [] };
    const outcome = { competition: one, participation: one, trophyAwards: one };
    harness.mocks.tpCompetitionImportService.importCompetition.mockResolvedValue(
      outcome,
    );
    const awards = [{ id: 24112, awardType: 1, rosterId: 179769 }];

    const result = await call(harness.router.tpCompetitions.import, {
      tournament: { id: 18442, name: 'Säsong 30' },
      playedDates: ['2026-01-10T00:00:00.000Z'],
      era: 'Fourth era',
      participantRosterIds: [179769],
      awards,
      externalSystemName: 'TP',
    });

    expect(result).toEqual(outcome);
    expect(
      harness.mocks.tpCompetitionImportService.importCompetition,
    ).toHaveBeenCalledWith({
      tournament: { id: 18442, name: 'Säsong 30' },
      playedDates: [new Date('2026-01-10T00:00:00.000Z')],
      era: 'Fourth era',
      participantRosterIds: [179769],
      awards,
      externalSystemName: 'TP',
    });
  });
});
