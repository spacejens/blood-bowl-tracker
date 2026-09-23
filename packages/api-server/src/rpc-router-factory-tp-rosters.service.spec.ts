import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

describe('RpcRouterFactoryService tpRosters router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('imports one raw roster through TpRosterImportService', async () => {
    const outcome = {
      team: { success: true, imported: 1, errors: [] },
      players: { success: true, imported: 2, errors: [] },
      teamEras: [{ id: 31, eraId: 40 }],
      importedPlayers: [{ lineUpId: 5001, playerId: 700, created: true }],
      mercenaryPositionUsages: [],
    };
    harness.mocks.tpRosterImportService.importRawRoster.mockResolvedValue(
      outcome,
    );
    const raw = { id: 163386 };

    const result = await call(harness.router.tpRosters.import, {
      roster: raw,
      era: 'Fourth era',
      externalSystemName: 'TP',
    });

    expect(result).toEqual(outcome);
    expect(
      harness.mocks.tpRosterImportService.importRawRoster,
    ).toHaveBeenCalledWith({
      content: raw,
      era: 'Fourth era',
      externalSystemName: 'TP',
      matchEmbeddedPlayers: [],
    });
  });
});
