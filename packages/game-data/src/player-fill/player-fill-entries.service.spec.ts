import type {
  FillIncompletePlayer,
  PlayerSkillEntry,
} from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PlayerFillEntriesService } from './player-fill-entries.service';

const fill: FillIncompletePlayer = {
  playerId: 9,
  status: 'active',
  characteristics: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
  sppTotal: 30,
  unspentSpp: 0,
  startingSkills: [{ skillId: 70, attributeValue: '4+' }],
  advancements: [
    {
      kind: 'skill',
      skillId: 71,
      attributeValue: null,
      source: 'chosen',
      isFreeExtra: false,
    },
    {
      kind: 'skill',
      skillId: 72,
      attributeValue: 'Dwarf',
      source: 'advancement',
      isFreeExtra: true,
    },
    { kind: 'characteristic', characteristic: 'AG' },
  ],
};

describe('PlayerFillEntriesService', () => {
  let service: PlayerFillEntriesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerFillEntriesService],
    }).compile();
    service = moduleRef.get(PlayerFillEntriesService);
  });

  it('lists the starting skills, then every advancement confirmed and numbered from 1', () => {
    expect(service.entries(fill)).toEqual([
      { playerId: 9, skillId: 70, source: 'starting', attributeValue: '4+' },
      {
        playerId: 9,
        skillId: 71,
        source: 'chosen',
        attributeValue: null,
        isFreeExtra: false,
        advancementOrder: 1,
        orderConfirmed: true,
      },
      {
        playerId: 9,
        skillId: 72,
        source: 'advancement',
        attributeValue: 'Dwarf',
        isFreeExtra: true,
        advancementOrder: 2,
        orderConfirmed: true,
      },
      {
        playerId: 9,
        source: 'characteristic',
        characteristic: 'AG',
        advancementOrder: 3,
        orderConfirmed: true,
      },
    ]);
  });

  it('numbers only paid rows, skipping starting skills and free extras', () => {
    const resolved: PlayerSkillEntry[] = [
      { playerId: 9, skillId: 70, source: 'starting', attributeValue: '4+' },
      { playerId: 9, skillId: 71, source: 'chosen', isFreeExtra: false },
      { playerId: 9, skillId: 72, source: 'advancement', isFreeExtra: true },
      { playerId: 9, source: 'characteristic', characteristic: 'AG' },
    ];

    expect(service.plan(resolved)).toEqual([
      {
        skillId: 70,
        characteristic: null,
        attributeValue: '4+',
        source: 'starting',
        isFreeExtra: false,
        paidNumber: null,
      },
      {
        skillId: 71,
        characteristic: null,
        attributeValue: null,
        source: 'chosen',
        isFreeExtra: false,
        paidNumber: 1,
      },
      {
        skillId: 72,
        characteristic: null,
        attributeValue: null,
        source: 'advancement',
        isFreeExtra: true,
        paidNumber: null,
      },
      {
        skillId: null,
        characteristic: 'AG',
        attributeValue: null,
        source: 'characteristic',
        isFreeExtra: false,
        paidNumber: 2,
      },
    ]);
  });
});
