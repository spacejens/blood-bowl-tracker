import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { TpSkillMasterNamesService } from './tp-skill-master-names.service';

async function makeService(
  files: Record<string, unknown>,
): Promise<TpSkillMasterNamesService> {
  const root = await mkdtemp(join(tmpdir(), 'review-race-tp-skills-'));
  const competitionDir = join(root, 'fourth-era', 'a-cup');
  await mkdir(competitionDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(competitionDir, name), JSON.stringify(body), 'utf8');
  }
  const config: MockProxy<RaceReviewConfigService> =
    mock<RaceReviewConfigService>();
  config.getDataDir.mockReturnValue(root);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpSkillMasterNamesService,
      { provide: RaceReviewConfigService, useValue: config },
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
    const root = await mkdtemp(join(tmpdir(), 'review-race-tp-skills-'));
    const competitionDir = join(root, 'fourth-era', 'a-cup');
    await mkdir(competitionDir, { recursive: true });
    await writeFile(
      join(competitionDir, 'rosters_1.json'),
      '{ not json',
      'utf8',
    );
    const config = mock<RaceReviewConfigService>();
    config.getDataDir.mockReturnValue(root);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpSkillMasterNamesService,
        { provide: RaceReviewConfigService, useValue: config },
      ],
    }).compile();
    const service = moduleRef.get(TpSkillMasterNamesService);

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
    const config = mock<RaceReviewConfigService>();
    config.getDataDir.mockReturnValue(join(tmpdir(), 'review-race-absent-dir'));
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpSkillMasterNamesService,
        { provide: RaceReviewConfigService, useValue: config },
      ],
    }).compile();
    const service = moduleRef.get(TpSkillMasterNamesService);

    expect(await service.masterFor(261)).toBeNull();
  });
});
