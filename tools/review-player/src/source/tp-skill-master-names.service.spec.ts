import {
  TpFileNameService,
  TpFilesReaderService,
} from '@blood-bowl-tracker/read-tp-files';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import { stubTpFiles } from './tp-files-fixtures.test-helpers';
import { TpSkillMasterNamesService } from './tp-skill-master-names.service';

/** Files in one competition, listed in the order given; an Error body makes the read fail. */
async function makeService(
  files: Record<string, unknown>,
): Promise<TpSkillMasterNamesService> {
  const tpFiles = mock<TpFilesReaderService>();
  stubTpFiles(tpFiles, {
    eras: Object.entries(files).map(([name, body]) => ({
      era: 'fourth-era',
      competition: 'a-cup',
      name,
      body,
    })),
  });
  const config: MockProxy<ReviewPlayerConfigService> =
    mock<ReviewPlayerConfigService>();
  config.getDataDir.mockReturnValue('/data/tp');
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpSkillMasterNamesService,
      TpFileNameService,
      { provide: TpFilesReaderService, useValue: tpFiles },
      { provide: ReviewPlayerConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(TpSkillMasterNamesService);
}

describe('TpSkillMasterNamesService', () => {
  it('resolves a skill master id embedded in a roster file', async () => {
    const service = await makeService({
      'rosters_1.json': {
        lineUps: [{ skills: [{ skillMaster: { id: 261, name: 'Guard' } }] }],
      },
    });

    expect(await service.masterFor(261)).toEqual({
      name: 'Guard',
      isElite: false,
    });
  });

  it('or-accumulates the elite marker across embeddings of the same id', async () => {
    const service = await makeService({
      'rosters_1.json': {
        lineUps: [
          { skills: [{ skillMaster: { id: 220, name: 'Block' } }] },
          {
            skills: [
              { skillMaster: { id: 220, name: 'Block', isElite: true } },
            ],
          },
        ],
      },
    });

    expect(await service.masterFor(220)).toEqual({
      name: 'Block',
      isElite: true,
    });
  });

  it('ignores files that are not roster files', async () => {
    const service = await makeService({
      'match_1.json': {
        lineUps: [{ skills: [{ skillMaster: { id: 261, name: 'Guard' } }] }],
      },
    });

    expect(await service.masterFor(261)).toBeNull();
  });

  it('skips a malformed roster file instead of failing the run', async () => {
    const service = await makeService({
      'rosters_1.json': new Error('Failed to parse TP file rosters_1.json'),
    });

    expect(await service.masterFor(261)).toBeNull();
  });

  it('returns null for an id no roster file explains', async () => {
    const service = await makeService({
      'rosters_1.json': {
        lineUps: [{ skills: [{ skillMaster: { id: 261, name: 'Guard' } }] }],
      },
    });

    expect(await service.masterFor(999)).toBeNull();
  });

  it('returns null when the TP data directory does not exist', async () => {
    const service = await makeService({});

    expect(await service.masterFor(261)).toBeNull();
  });
});
