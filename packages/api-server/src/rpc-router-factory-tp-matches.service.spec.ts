import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

describe('RpcRouterFactoryService tpMatches router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('imports one raw match through TpMatchImportService', async () => {
    const one = { success: true, imported: 1, errors: [] };
    const outcome = {
      match: one,
      participation: one,
      events: { success: true, imported: 14, errors: [] },
      outcome: one,
    };
    harness.mocks.tpMatchImportService.importRawMatch.mockResolvedValue(
      outcome,
    );
    const raw = { matchId: 662796 };
    const bracket = [
      {
        id: 662796,
        phaseOrder: 1,
        round: 2,
        homeTeamTpId: 163386,
        awayTeamTpId: 179769,
        winner: 'away' as const,
      },
    ];

    const result = await call(harness.router.tpMatches.import, {
      match: raw,
      bracket,
      competitionTpId: 18442,
      externalSystemName: 'TP',
    });

    expect(result).toEqual(outcome);
    expect(
      harness.mocks.tpMatchImportService.importRawMatch,
    ).toHaveBeenCalledWith({
      content: raw,
      bracket,
      competitionTpId: 18442,
      externalSystemName: 'TP',
    });
  });
});
