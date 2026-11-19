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

  describe('in an era whose rules sets never heal', () => {
    it.each([[['CRP']], [['CRP+']], [['BB2016']], [['CRP', 'CRP+', 'BB2016']]])(
      'counts reductions across competitions under %j',
      (rulesSetNames) => {
        expect(
          service.prove(
            proofInput({
              rulesSetNames,
              reductions: [
                reduction(),
                reduction({
                  characteristic: 'av',
                  competitionId: 51,
                  playedAt: '2024-09-01T19:00:00+00:00',
                }),
              ],
              competitions: [
                competition(),
                competition({
                  competitionId: 51,
                  firstPlayedAt: '2024-08-01T19:00:00+00:00',
                  lastPlayedAt: '2024-10-01T19:00:00+00:00',
                }),
              ],
            }),
          ),
        ).toEqual({ ma: 1, st: 0, ag: 0, pa: 0, av: 1 });
      },
    );

    it('counts reductions without competition rows or readable dates', () => {
      expect(
        service.prove(
          proofInput({
            rulesSetNames: ['CRP'],
            reductions: [reduction({ playedAt: 'not a date' })],
            competitions: [],
          }),
        ),
      ).toEqual({ ma: 1, st: 0, ag: 0, pa: 0, av: 0 });
    });

    it('is still uncertain without any reduction', () => {
      expect(
        service.prove(proofInput({ rulesSetNames: ['CRP'], reductions: [] })),
      ).toBeUndefined();
    });
  });

  describe('in an era that may heal', () => {
    const spanning = {
      reductions: [
        reduction(),
        reduction({ competitionId: 51, playedAt: '2024-09-01T19:00:00+00:00' }),
      ],
      competitions: [
        competition(),
        competition({
          competitionId: 51,
          firstPlayedAt: '2024-08-01T19:00:00+00:00',
          lastPlayedAt: '2024-10-01T19:00:00+00:00',
        }),
      ],
    };

    it.each([
      ['a mixed era', ['CRP', 'BB2020']],
      ['an unknown rules set', ['Homebrew 2023']],
      ['an era with no rules set', []],
      ['a healing rules set', ['DB2021']],
    ])('is uncertain across competitions in %s', (_name, rulesSetNames) => {
      expect(
        service.prove(proofInput({ ...spanning, rulesSetNames })),
      ).toBeUndefined();
    });
  });

  describe('with a recorded death', () => {
    /** Reductions in competition 50 (Feb-Apr 2024); death on 15 March. */
    const DIED = '2024-03-15T19:00:00+00:00';
    /**
     * A competition his team played after his death. It defeats the
     * one-competition proof, so a test using it reaches the death proof.
     */
    const PLAYED_ON = competition({
      competitionId: 51,
      firstPlayedAt: '2024-05-01T19:00:00+00:00',
      lastPlayedAt: '2024-09-01T19:00:00+00:00',
    });

    it("counts reductions when he died in the reductions' competition and the team played on", () => {
      expect(
        service.prove(
          proofInput({
            diedAt: DIED,
            reductions: [
              reduction(),
              reduction({
                characteristic: 'st',
                playedAt: '2024-03-15T19:00:00+00:00',
              }),
            ],
            competitions: [competition(), PLAYED_ON],
          }),
        ),
      ).toEqual({ ma: 1, st: 1, ag: 0, pa: 0, av: 0 });
    });

    it('is uncertain when he died in a later competition', () => {
      expect(
        service.prove(
          proofInput({
            diedAt: '2024-06-01T19:00:00+00:00',
            competitions: [
              competition(),
              competition({
                competitionId: 51,
                firstPlayedAt: '2024-05-01T19:00:00+00:00',
                lastPlayedAt: '2024-06-01T19:00:00+00:00',
              }),
            ],
          }),
        ),
      ).toBeUndefined();
    });

    it('is uncertain when his reductions span competitions before his death', () => {
      expect(
        service.prove(
          proofInput({
            diedAt: '2024-06-01T19:00:00+00:00',
            reductions: [
              reduction(),
              reduction({
                competitionId: 51,
                playedAt: '2024-06-01T19:00:00+00:00',
              }),
            ],
            competitions: [
              competition(),
              competition({
                competitionId: 51,
                firstPlayedAt: '2024-05-01T19:00:00+00:00',
                lastPlayedAt: '2024-06-01T19:00:00+00:00',
              }),
            ],
          }),
        ),
      ).toBeUndefined();
    });

    it('is uncertain when another competition overlaps the time between reduction and death', () => {
      expect(
        service.prove(
          proofInput({
            diedAt: DIED,
            competitions: [
              competition(),
              competition({
                competitionId: 51,
                firstPlayedAt: '2024-03-10T19:00:00+00:00',
                lastPlayedAt: '2024-04-20T19:00:00+00:00',
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
            diedAt: DIED,
            competitions: [
              competition({
                competitionId: 49,
                firstPlayedAt: '2023-10-01T19:00:00+00:00',
                lastPlayedAt: '2023-12-01T19:00:00+00:00',
              }),
              competition(),
              PLAYED_ON,
            ],
          }),
        ),
      ).toEqual({ ma: 1, st: 0, ag: 0, pa: 0, av: 0 });
    });

    it('is uncertain when a reduction is recorded after his death', () => {
      expect(
        service.prove(
          proofInput({
            diedAt: DIED,
            reductions: [
              reduction(),
              reduction({ playedAt: '2024-03-20T19:00:00+00:00' }),
            ],
            competitions: [competition(), PLAYED_ON],
          }),
        ),
      ).toBeUndefined();
    });

    it('is uncertain when a reduction is in a competition with no row', () => {
      expect(
        service.prove(
          proofInput({
            diedAt: DIED,
            competitions: [competition({ competitionId: 49 })],
          }),
        ),
      ).toBeUndefined();
    });

    it.each([
      [
        'the death date',
        { diedAt: 'not a date', competitions: [competition(), PLAYED_ON] },
      ],
      [
        "another competition's first match",
        {
          diedAt: DIED,
          competitions: [
            competition(),
            PLAYED_ON,
            competition({
              competitionId: 52,
              firstPlayedAt: 'not a date',
              lastPlayedAt: '2024-01-15T19:00:00+00:00',
            }),
          ],
        },
      ],
      [
        "another competition's last match",
        {
          diedAt: DIED,
          competitions: [
            competition(),
            competition({
              competitionId: 51,
              firstPlayedAt: '2024-05-01T19:00:00+00:00',
              lastPlayedAt: 'not a date',
            }),
          ],
        },
      ],
    ])('is uncertain when %s cannot be read', (_name, overrides) => {
      expect(service.prove(proofInput(overrides))).toBeUndefined();
    });
  });
});
