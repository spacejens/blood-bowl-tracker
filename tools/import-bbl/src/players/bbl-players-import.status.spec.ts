import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import { describe, expect, it } from 'vitest';

import { mockBblSourceReaderByType } from '../shared/bbl-source-reader-mock.test-helpers';
import {
  goodPlayer,
  importOptions,
  makeService,
  plPage,
} from './bbl-players-import.test-helpers';

describe('BblPlayersImportService status', () => {
  it.each<PlayerStatus>(['active', 'dead', 'retired', 'temporarily_retired'])(
    'sends the %s status parsed off the player page',
    async (status) => {
      const { service, mocks } = await makeService(
        mockBblSourceReaderByType({ pl: [plPage({ ...goodPlayer, status })] }),
      );

      await service.importPlayers(importOptions);

      expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalledWith(
        expect.objectContaining({ status }),
        expect.any(Array),
      );
    },
  );
});
