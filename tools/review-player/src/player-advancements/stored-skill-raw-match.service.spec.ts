import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { StoredPlayerSkill } from '../advancement-costs/advancement-cost-model.types';
import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import type { BblRawPlayerAdvancements } from '../source/bbl-player-skills-cell.service';
import type { TpRawPlayerAdvancements } from '../source/tp-raw-player-skills-index.service';
import { TpRawPlayerSkillsIndexService } from '../source/tp-raw-player-skills-index.service';
import { StoredSkillRawMatchService } from './stored-skill-raw-match.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 5,
  externalId: '1000',
  playerName: 'Grim',
  teamName: 'Dwarf Giants',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
  selectedFor: ['Random sample'],
};

function stored(
  skillId: number,
  skillName: string,
  source: StoredPlayerSkill['source'],
): StoredPlayerSkill {
  return {
    skillId,
    skillName,
    attributeValue: null,
    source,
    advancementOrder: source === 'starting' ? null : 1,
    orderConfirmed: false,
    isFreeExtra: false,
    category: null,
    isElite: false,
  };
}

function bblRaw(
  skills: { name: string; source: 'starting' | 'gained' }[],
): BblRawPlayerAdvancements {
  return {
    skills: skills.map((skill, index) => ({
      name: skill.name,
      attributeValue: null,
      source: skill.source,
      advancementOrder: skill.source === 'starting' ? null : index + 1,
    })),
    increases: [],
  };
}

function tpRaw(starting: string[], gained: string[]): TpRawPlayerAdvancements {
  return {
    startingSkills: starting.map((name, index) => ({
      skillMasterId: index,
      name,
      attributeValue: null,
      isElite: false,
    })),
    gainedSkills: gained.map((name, index) => ({
      skillMasterId: 100 + index,
      name,
      attributeValue: null,
      isElite: false,
      isRandom: true,
    })),
    characteristicDiffs: {
      move: 0,
      strength: 0,
      agility: 0,
      passing: 0,
      armour: 0,
    },
    hasTemplate: true,
  };
}

async function makeService(input: {
  db?: MockDbResult;
  bbl?: BblRawPlayerAdvancements | null;
  tp?: TpRawPlayerAdvancements | null;
}): Promise<{
  service: StoredSkillRawMatchService;
  bbl: MockProxy<BblPlayerAdvancementsReaderService>;
  db: MockDbResult;
}> {
  const db = input.db ?? mockDb();
  const bbl = mock<BblPlayerAdvancementsReaderService>();
  const tp = mock<TpRawPlayerSkillsIndexService>();
  bbl.read.mockResolvedValue(input.bbl ?? null);
  tp.advancementsFor.mockResolvedValue(input.tp ?? null);
  const moduleRef = await Test.createTestingModule({
    providers: [
      StoredSkillRawMatchService,
      { provide: DB, useValue: db.db },
      { provide: BblPlayerAdvancementsReaderService, useValue: bbl },
      { provide: TpRawPlayerSkillsIndexService, useValue: tp },
    ],
  }).compile();
  return { service: moduleRef.get(StoredSkillRawMatchService), bbl, db };
}

describe('StoredSkillRawMatchService', () => {
  it('says not read for every skill when the raw source has no data', async () => {
    const block = stored(1, 'Block', 'starting');
    const { service, db } = await makeService({});

    const match = await service.match(player, [block]);

    expect(match.verdicts.get(block)).toBe('not read');
    expect(match.rawOnly).toEqual([]);
    expect(db.chains).toHaveLength(0);
  });

  it('matches by name and starting-or-gained origin', async () => {
    const block = stored(1, 'Block', 'starting');
    const guard = stored(2, 'Guard', 'random');
    const { service } = await makeService({
      db: mockDb([]),
      bbl: bblRaw([
        { name: 'Block', source: 'starting' },
        { name: 'Guard', source: 'gained' },
      ]),
    });

    const match = await service.match(player, [block, guard]);

    expect(match.verdicts.get(block)).toBe('yes');
    expect(match.verdicts.get(guard)).toBe('yes');
    expect(match.rawOnly).toEqual([]);
  });

  it('matches a differently-spelled raw skill through its curated Name id', async () => {
    const boneHead = stored(7, 'Bone-Head', 'starting');
    const { service } = await makeService({
      db: mockDb([{ externalId: 'Bone Head', skillId: 7 }]),
      bbl: bblRaw([{ name: 'Bone Head', source: 'starting' }]),
    });

    const match = await service.match(player, [boneHead]);

    expect(match.verdicts.get(boneHead)).toBe('yes');
    expect(match.rawOnly).toEqual([]);
  });

  it('counts two raw spellings of one stored skill as both accounted for', async () => {
    const boneHead = stored(7, 'Bone-Head', 'starting');
    const { service } = await makeService({
      db: mockDb([
        { externalId: 'Bone Head', skillId: 7 },
        { externalId: 'Bonehead', skillId: 7 },
      ]),
      bbl: bblRaw([
        { name: 'Bone Head', source: 'starting' },
        { name: 'Bonehead', source: 'starting' },
      ]),
    });

    const match = await service.match(player, [boneHead]);

    expect(match.verdicts.get(boneHead)).toBe('yes');
    expect(match.rawOnly).toEqual([]);
  });

  it('flags a stored skill the raw source lacks and lists a raw-only skill', async () => {
    const guard = stored(2, 'Guard', 'chosen');
    const { service } = await makeService({
      db: mockDb([]),
      bbl: bblRaw([{ name: 'Dodge', source: 'gained' }]),
    });

    const match = await service.match(player, [guard]);

    expect(match.verdicts.get(guard)).toBe('not in the raw source');
    expect(match.rawOnly).toEqual(['Dodge']);
  });

  it('flags a BBL starting-or-gained mismatch even when the name agrees', async () => {
    const block = stored(1, 'Block', 'chosen');
    const { service } = await makeService({
      db: mockDb([]),
      bbl: bblRaw([{ name: 'Block', source: 'starting' }]),
    });

    const match = await service.match(player, [block]);

    expect(match.verdicts.get(block)).toBe('not in the raw source');
    expect(match.rawOnly).toEqual(['Block']);
  });

  it("reads a TP player's starting and gained skills from TP", async () => {
    const block = stored(1, 'Block', 'starting');
    const dodge = stored(2, 'Dodge', 'starting');
    const { service, bbl } = await makeService({
      db: mockDb([]),
      tp: tpRaw(['Block'], ['Dodge']),
    });

    const match = await service.match({ ...player, source: 'tp' }, [
      block,
      dodge,
    ]);

    expect(match.verdicts.get(block)).toBe('yes');
    expect(match.verdicts.get(dodge)).toBe('not in the raw source');
    expect(match.rawOnly).toEqual(['Dodge']);
    expect(bbl.read).not.toHaveBeenCalled();
  });

  it('skips a TP skill with no name and runs no query when nothing is named', async () => {
    const raw = tpRaw([], []);
    raw.gainedSkills.push({
      skillMasterId: 9,
      name: null,
      attributeValue: null,
      isElite: false,
      isRandom: true,
    });
    const { service, db } = await makeService({ tp: raw });

    const match = await service.match({ ...player, source: 'tp' }, []);

    expect(match.rawOnly).toEqual([]);
    expect(db.chains).toHaveLength(0);
  });
});
