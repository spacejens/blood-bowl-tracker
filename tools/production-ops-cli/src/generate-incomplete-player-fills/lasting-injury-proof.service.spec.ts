import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  StatReductionEventRow,
  TeamCompetitionRow,
} from './fill-plan.types';
import {
  type LastingInjuryInput,
  LastingInjuryProofService,
} from './lasting-injury-proof.service';

function reduction(
  overrides: Partial<StatReductionEventRow> = {},
): StatReductionEventRow {
  return {
    playerId: 1,
    characteristic: 'ma',
    competitionId: 50,
    playedAt: '2024-03-01T19:00:00+00:00',
    ...overrides,
  };
}

function competition(
  overrides: Partial<TeamCompetitionRow> = {},
): TeamCompetitionRow {
  return {
    playerId: 1,
    competitionId: 50,
    firstPlayedAt: '2024-02-01T19:00:00+00:00',
    lastPlayedAt: '2024-04-01T19:00:00+00:00',
    ...overrides,
  };
}

/** A BB2020 player with no recorded death: only the one-competition proof applies. */
function proofInput(
  overrides: Partial<LastingInjuryInput> = {},
): LastingInjuryInput {
  return {
    reductions: [reduction()],
    competitions: [competition()],
    rulesSetNames: ['BB2020'],
    diedAt: null,
    ...overrides,
  };
}

describe('LastingInjuryProofService', () => {
  let service: LastingInjuryProofService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [LastingInjuryProofService],
    }).compile();
    service = moduleRef.get(LastingInjuryProofService);
  });

  it('counts the reductions per characteristic when all fall in his last competition', () => {
    expect(
      service.prove(
        proofInput({
          reductions: [
            reduction(),
            reduction({ characteristic: 'av' }),
            reduction({ characteristic: 'ma' }),
          ],
          competitions: [competition()],
        }),
      ),
    ).toEqual({ ma: 2, st: 0, ag: 0, pa: 0, av: 1 });
  });

  it('is uncertain without any competition rows', () => {
    expect(
      service.prove(
        proofInput({ reductions: [reduction()], competitions: [] }),
      ),
    ).toBeUndefined();
  });

  it('is uncertain when the competition rows omit the reductions own competition', () => {
    expect(
      service.prove(
        proofInput({
          reductions: [reduction()],
          competitions: [
            competition({
              competitionId: 49,
              lastPlayedAt: '2023-12-01T19:00:00+00:00',
            }),
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it('is uncertain without any reduction', () => {
    expect(
      service.prove(
        proofInput({ reductions: [], competitions: [competition()] }),
      ),
    ).toBeUndefined();
  });

  it('is uncertain when the reductions span two competitions', () => {
    expect(
      service.prove(
        proofInput({
          reductions: [reduction(), reduction({ competitionId: 51 })],
          competitions: [competition(), competition({ competitionId: 51 })],
        }),
      ),
    ).toBeUndefined();
  });

  it('is uncertain when his team era played another competition afterwards', () => {
    expect(
      service.prove(
        proofInput({
          reductions: [reduction()],
          competitions: [
            competition(),
            competition({
              competitionId: 51,
              lastPlayedAt: '2024-09-01T19:00:00+00:00',
            }),
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it('ignores another competition that ended before the first reduction', () => {
    expect(
      service.prove(
        proofInput({
          reductions: [reduction()],
          competitions: [
            competition({
              competitionId: 49,
              lastPlayedAt: '2023-12-01T19:00:00+00:00',
            }),
            competition(),
          ],
        }),
      ),
    ).toEqual({ ma: 1, st: 0, ag: 0, pa: 0, av: 0 });
  });

  it('ignores another competition whose last match is the reduction match', () => {
    expect(
      service.prove(
        proofInput({
          reductions: [reduction()],
          competitions: [
            competition(),
            competition({
              competitionId: 51,
              lastPlayedAt: '2024-03-01T19:00:00+00:00',
            }),
          ],
        }),
      ),
    ).toEqual({ ma: 1, st: 0, ag: 0, pa: 0, av: 0 });
  });

  it('measures from the earliest reduction', () => {
    expect(
      service.prove(
        proofInput({
          reductions: [
            reduction({ playedAt: '2024-05-01T19:00:00+00:00' }),
            reduction({ playedAt: '2024-03-01T19:00:00+00:00' }),
          ],
          competitions: [
            competition(),
            competition({
              competitionId: 51,
              lastPlayedAt: '2024-04-01T19:00:00+00:00',
            }),
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it('is uncertain when a date cannot be read', () => {
    expect(
      service.prove(
        proofInput({
          reductions: [reduction({ playedAt: 'not a date' })],
          competitions: [competition()],
        }),
      ),
    ).toBeUndefined();
    expect(
      service.prove(
        proofInput({
          reductions: [reduction()],
          competitions: [
            competition(),
            competition({ competitionId: 51, lastPlayedAt: 'not a date' }),
          ],
        }),
      ),
    ).toBeUndefined();
  });
});
