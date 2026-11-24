import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SnapshotSkillResolverService } from './snapshot-skill-resolver.service';

const TP_IDS = [
  { skillId: 100, masterId: '96' },
  { skillId: 200, masterId: '92' },
  { skillId: 200, masterId: '1092' },
  { skillId: 300, masterId: '50' },
  { skillId: 301, masterId: '50' },
  { skillId: 400, masterId: '136' },
  { skillId: 500, masterId: '7' },
  { skillId: 600, masterId: '20' },
];
const NAMES = [
  { skillId: 100, skillName: 'Block', nameId: 'Block' },
  { skillId: 200, skillName: 'Dodge', nameId: 'Dodge' },
  { skillId: 400, skillName: 'Guard', nameId: 'Guard (a)' },
  { skillId: 400, skillName: 'Guard', nameId: 'Guard (b)' },
  { skillId: 600, skillName: 'Wrestle', nameId: 'Wrestle' },
  { skillId: 600, skillName: 'Wrestle', nameId: 'Wresle' },
  { skillId: 600, skillName: 'Wrestle', nameId: 'Wrestle' },
];

describe('SnapshotSkillResolverService', () => {
  let service: SnapshotSkillResolverService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SnapshotSkillResolverService],
    }).compile();
    service = moduleRef.get(SnapshotSkillResolverService);
  });

  function resolve(masterIds: number[], attributed: number[] = []) {
    return service.resolve({
      masterIds,
      tpSkillIds: TP_IDS,
      skillNames: NAMES,
      attributedSkillIds: new Set(attributed),
    });
  }

  it('resolves each id to the one skill carrying it, with its Name id', () => {
    expect(resolve([96, 92])).toEqual([
      { skillId: 100, skillName: 'Block', nameId: 'Block', attributed: false },
      { skillId: 200, skillName: 'Dodge', nameId: 'Dodge', attributed: false },
    ]);
  });

  it("resolves any of a skill's per-rules-set ids to it", () => {
    expect(resolve([1092])).toEqual([
      { skillId: 200, skillName: 'Dodge', nameId: 'Dodge', attributed: false },
    ]);
  });

  it('leaves the player unresolved when an id names no skill', () => {
    expect(resolve([96, 999])).toBeUndefined();
  });

  it('leaves the player unresolved when an id names several skills', () => {
    expect(resolve([50])).toBeUndefined();
  });

  it('takes the Name id equal to the stored name when there are several', () => {
    expect(resolve([20])).toEqual([
      {
        skillId: 600,
        skillName: 'Wrestle',
        nameId: 'Wrestle',
        attributed: false,
      },
    ]);
  });

  it('gives no Name id to a skill with none, or with none equal to its name', () => {
    expect(resolve([7, 136])).toEqual([
      { skillId: 500, skillName: null, nameId: null, attributed: false },
      { skillId: 400, skillName: null, nameId: null, attributed: false },
    ]);
  });

  it('flags a skill held with a variant somewhere', () => {
    expect(resolve([92], [200])).toEqual([
      { skillId: 200, skillName: 'Dodge', nameId: 'Dodge', attributed: true },
    ]);
  });

  it('resolves no ids to no skills', () => {
    expect(resolve([])).toEqual([]);
  });
});
