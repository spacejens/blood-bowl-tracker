import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import { TpRawPlayerSkillsIndexService } from './tp-raw-player-skills-index.service';

async function makeService(
  files: Record<string, unknown>,
): Promise<TpRawPlayerSkillsIndexService> {
  const root = await mkdtemp(join(tmpdir(), 'review-player-tp-skills-'));
  const competitionDir = join(root, 'fourth-era', 'a-cup');
  await mkdir(competitionDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(competitionDir, name), JSON.stringify(body), 'utf8');
  }
  const config: MockProxy<ReviewPlayerConfigService> =
    mock<ReviewPlayerConfigService>();
  config.getDataDir.mockReturnValue(root);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpRawPlayerSkillsIndexService,
      { provide: ReviewPlayerConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(TpRawPlayerSkillsIndexService);
}

describe('TpRawPlayerSkillsIndexService', () => {
  it("splits template skills from the player's own gained skills", async () => {
    const service = await makeService({
      'rosters_1.json': {
        lineUps: [
          {
            id: 2412443,
            ma: 6,
            st: 3,
            ag: 3,
            pa: 4,
            av: 9,
            lineUpMaster: {
              ma: 6,
              st: 3,
              ag: 3,
              pa: 4,
              av: 9,
              skills: [
                { skillMasterId: 275, skillMaster: { id: 275, name: 'Decay' } },
              ],
            },
            skills: [
              {
                skillMasterId: 261,
                skillMaster: { id: 261, name: 'Guard' },
                isRandom: false,
                isElite: true,
              },
            ],
          },
        ],
      },
    });

    const advancements = await service.advancementsFor('2412443');

    expect(advancements?.startingSkills).toEqual([
      {
        skillMasterId: 275,
        name: 'Decay',
        attributeValue: null,
        isElite: false,
      },
    ]);
    expect(advancements?.gainedSkills).toEqual([
      {
        skillMasterId: 261,
        name: 'Guard',
        attributeValue: null,
        isElite: true,
        isRandom: false,
      },
    ]);
  });

  it('reads a skill attribute value off the embedded attribute master', async () => {
    const service = await makeService({
      'rosters_1.json': {
        lineUps: [
          {
            id: 500,
            ma: 6,
            st: 3,
            ag: 3,
            pa: 4,
            av: 9,
            lineUpMaster: { ma: 6, st: 3, ag: 3, pa: 4, av: 9, skills: [] },
            skills: [
              {
                skillMasterId: 15,
                skillMaster: { id: 15, name: 'Mighty Blow' },
                skillAttributeMaster: { value: '4+', type: 0 },
                isRandom: true,
                isElite: false,
              },
            ],
          },
        ],
      },
    });

    const advancements = await service.advancementsFor('500');

    expect(advancements?.gainedSkills).toEqual([
      {
        skillMasterId: 15,
        name: 'Mighty Blow',
        attributeValue: '4+',
        isElite: false,
        isRandom: true,
      },
    ]);
  });

  it('derives per-characteristic improvements against the position template', async () => {
    // MA/ST/AV improve upwards; AG/PA are roll targets, so they improve
    // downwards. A worse-than-template value counts as no improvement.
    const service = await makeService({
      'rosters_1.json': {
        lineUps: [
          {
            id: 7,
            ma: 7,
            st: 4,
            ag: 2,
            pa: 4,
            av: 8,
            lineUpMaster: { ma: 6, st: 3, ag: 3, pa: 4, av: 9, skills: [] },
            skills: [],
          },
        ],
      },
    });

    expect((await service.advancementsFor('7'))?.characteristicDiffs).toEqual({
      move: 1,
      strength: 1,
      agility: 1,
      passing: 0,
      armour: 0,
    });
  });

  it('reports no template when the roster entry carries none', async () => {
    const service = await makeService({
      'rosters_1.json': {
        lineUps: [
          {
            id: 42,
            ma: 6,
            st: 3,
            ag: 3,
            pa: 4,
            av: 9,
            skills: [
              {
                skillMasterId: 10,
                skillMaster: { id: 10, name: 'Block' },
                isRandom: false,
                isElite: false,
              },
            ],
          },
        ],
      },
    });

    const advancements = await service.advancementsFor('42');

    expect(advancements?.hasTemplate).toBe(false);
    expect(advancements?.startingSkills).toEqual([]);
    expect(advancements?.characteristicDiffs).toEqual({
      move: 0,
      strength: 0,
      agility: 0,
      passing: 0,
      armour: 0,
    });
  });

  it('reports a missing isRandom as null rather than guessing', async () => {
    const service = await makeService({
      'rosters_1.json': {
        lineUps: [
          {
            id: 99,
            ma: 6,
            st: 3,
            ag: 3,
            pa: 4,
            av: 9,
            lineUpMaster: { ma: 6, st: 3, ag: 3, pa: 4, av: 9, skills: [] },
            skills: [
              {
                skillMasterId: 20,
                skillMaster: { id: 20, name: 'Dodge' },
                isElite: false,
              },
            ],
          },
        ],
      },
    });

    const advancements = await service.advancementsFor('99');

    expect(advancements?.gainedSkills).toEqual([
      {
        skillMasterId: 20,
        name: 'Dodge',
        attributeValue: null,
        isElite: false,
        isRandom: null,
      },
    ]);
  });

  it('returns null for a line-up id no roster file carries', async () => {
    const service = await makeService({
      'rosters_1.json': {
        lineUps: [
          {
            id: 1,
            ma: 6,
            st: 3,
            ag: 3,
            pa: 4,
            av: 9,
            lineUpMaster: { ma: 6, st: 3, ag: 3, pa: 4, av: 9, skills: [] },
            skills: [],
          },
        ],
      },
    });

    expect(await service.advancementsFor('999999')).toBeNull();
  });

  it('returns null for a non-numeric external id', async () => {
    const service = await makeService({
      'rosters_1.json': {
        lineUps: [
          {
            id: 1,
            ma: 6,
            st: 3,
            ag: 3,
            pa: 4,
            av: 9,
            lineUpMaster: { ma: 6, st: 3, ag: 3, pa: 4, av: 9, skills: [] },
            skills: [],
          },
        ],
      },
    });

    expect(await service.advancementsFor('not-a-number')).toBeNull();
  });
});
