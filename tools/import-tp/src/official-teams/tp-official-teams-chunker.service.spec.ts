import type { TpOfficialRace } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { officialRace, racePositions } from './official-teams.test-helpers';
import {
  OFFICIAL_TEAMS_POSITION_BUDGET,
  TpOfficialTeamsChunkerService,
} from './tp-official-teams-chunker.service';

function race(
  name: string,
  positionCount: number,
  teamRaceCode = name.toLowerCase(),
): TpOfficialRace {
  return officialRace({
    name,
    teamRaceCode,
    positions: racePositions(positionCount),
  });
}

function codes(chunks: TpOfficialRace[][]): string[][] {
  return chunks.map((chunk) => chunk.map((r) => r.teamRaceCode));
}

describe('TpOfficialTeamsChunkerService', () => {
  let service: TpOfficialTeamsChunkerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpOfficialTeamsChunkerService],
    }).compile();
    service = moduleRef.get(TpOfficialTeamsChunkerService);
  });

  it('uses a budget of 40 positions per request', () => {
    expect(OFFICIAL_TEAMS_POSITION_BUDGET).toBe(40);
  });

  it('packs whole races into a chunk up to exactly the budget', () => {
    const chunks = service.chunk({
      races: [race('Orc', 2), race('Dwarf', 3), race('Elf', 1)],
      positionBudget: 5,
    });

    expect(codes(chunks)).toEqual([['orc', 'dwarf'], ['elf']]);
  });

  it('starts a new chunk when a race would go one position over the budget', () => {
    const chunks = service.chunk({
      races: [race('Orc', 2), race('Dwarf', 4)],
      positionBudget: 5,
    });

    expect(codes(chunks)).toEqual([['orc'], ['dwarf']]);
  });

  it('sends a race larger than the budget alone', () => {
    const chunks = service.chunk({
      races: [race('Orc', 2), race('Dwarf', 7), race('Elf', 1)],
      positionBudget: 5,
    });

    expect(codes(chunks)).toEqual([['orc'], ['dwarf'], ['elf']]);
  });

  it('keeps every variant of one race name in the same chunk, in first-seen order', () => {
    const chunks = service.chunk({
      races: [
        race('Orc', 3, 'orc20'),
        race('Dwarf', 3, 'dwarf20'),
        race('Orc', 3, 'orcLegacy20'),
      ],
      positionBudget: 6,
    });

    expect(codes(chunks)).toEqual([['orc20', 'orcLegacy20'], ['dwarf20']]);
  });

  it('sends variants that together exceed the budget together, alone', () => {
    const chunks = service.chunk({
      races: [
        race('Elf', 1, 'elf20'),
        race('Orc', 4, 'orc20'),
        race('Orc', 4, 'orcLegacy20'),
      ],
      positionBudget: 5,
    });

    expect(codes(chunks)).toEqual([['elf20'], ['orc20', 'orcLegacy20']]);
  });

  it('chunks the same races the same way every time', () => {
    const races = [race('Orc', 2), race('Dwarf', 3), race('Elf', 4)];

    expect(service.chunk({ races, positionBudget: 5 })).toEqual(
      service.chunk({ races, positionBudget: 5 }),
    );
  });

  it('makes no chunk for no races', () => {
    expect(service.chunk({ races: [], positionBudget: 5 })).toEqual([]);
  });
});
