import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { CharacteristicChangeService } from './characteristic-change.service';
import { CharacteristicValidityService } from './characteristic-validity.service';
import { FillEntryBuilderService } from './fill-entry-builder.service';
import { candidate, profile } from './fill-plan.test-helpers';
import type { SkipReason } from './fill-plan.types';
import type { InjuryStageInput } from './injury-fill-stage.service';
import { InjuryFillStageService } from './injury-fill-stage.service';
import { LastingInjuryProofService } from './lasting-injury-proof.service';

function stageInput(
  overrides: Partial<InjuryStageInput> = {},
): InjuryStageInput {
  return {
    candidate: candidate({ sppTotal: 3 }),
    sppTotal: 3,
    status: 'retired',
    reductions: [
      {
        playerId: 1,
        characteristic: 'ma',
        competitionId: 50,
        playedAt: '2024-03-01T19:00:00+00:00',
      },
    ],
    competitions: [
      {
        playerId: 1,
        competitionId: 50,
        firstPlayedAt: '2024-02-01T19:00:00+00:00',
        lastPlayedAt: '2024-04-01T19:00:00+00:00',
      },
    ],
    stored: [],
    profile: profile(),
    ...overrides,
  };
}

describe('InjuryFillStageService', () => {
  let service: InjuryFillStageService;
  let proof: MockProxy<LastingInjuryProofService>;

  beforeEach(async () => {
    proof = mock<LastingInjuryProofService>();
    proof.prove.mockReturnValue({ ma: 1, st: 0, ag: 0, pa: 0, av: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        InjuryFillStageService,
        { provide: LastingInjuryProofService, useValue: proof },
        // Pure and dependency-free, so passed real.
        CharacteristicChangeService,
        CharacteristicValidityService,
        FillEntryBuilderService,
      ],
    }).compile();
    service = moduleRef.get(InjuryFillStageService);
  });

  function reasonFor(input: InjuryStageInput): SkipReason | undefined {
    const decision = service.decide(input);
    return 'reason' in decision ? decision.reason : undefined;
  }

  it('fills the player with the reduced line and his whole total unspent', () => {
    expect(service.decide(stageInput())).toEqual({
      entry: {
        player: { system: 'tourplay.net', id: '500' },
        status: 'retired',
        characteristics: { ma: 5, st: 3, ag: 3, pa: 4, av: 8 },
        sppTotal: 3,
        unspentSpp: 3,
        startingSkills: [{ system: 'Name', id: 'Block' }],
        advancements: [],
      },
    });
  });

  it('worsens AG and PA by their target-number formats', () => {
    proof.prove.mockReturnValue({ ma: 0, st: 0, ag: 1, pa: 1, av: 0 });

    const decision = service.decide(stageInput());

    expect('entry' in decision && decision.entry.characteristics).toEqual({
      ma: 6,
      st: 3,
      ag: 4,
      pa: 5,
      av: 9,
    });
  });

  it('passes the status through to the entry', () => {
    const decision = service.decide(stageInput({ status: 'active' }));

    expect('entry' in decision && decision.entry.status).toBe('active');
  });

  it('asks the proof about his reductions and his team era competitions', () => {
    const input = stageInput();
    service.decide(input);

    expect(proof.prove).toHaveBeenCalledWith({
      reductions: input.reductions,
      competitions: input.competitions,
    });
  });

  it('skips a player whose reductions may have healed', () => {
    proof.prove.mockReturnValue(undefined);

    expect(reasonFor(stageInput())).toBe('lasting-injury-uncertain');
  });

  it('skips a player whose position is ambiguous', () => {
    expect(reasonFor(stageInput({ profile: undefined }))).toBe(
      'position-ambiguous',
    );
  });

  it('skips a reduced line that is not valid', () => {
    expect(
      reasonFor(
        stageInput({
          profile: profile({ line: { ma: 6, st: 0, ag: 3, pa: 4, av: 9 } }),
        }),
      ),
    ).toBe('invalid-characteristics');
  });

  it('skips a player whose stored MA is the unreduced one', () => {
    expect(
      reasonFor(stageInput({ candidate: candidate({ sppTotal: 3, move: 6 }) })),
    ).toBe('stored-data-contradicts');
  });

  it('fills a player whose stored MA is the reduced one', () => {
    expect(
      reasonFor(stageInput({ candidate: candidate({ sppTotal: 3, move: 5 }) })),
    ).toBeUndefined();
  });

  it('skips a player whose stored unspent SPP differs from his total', () => {
    expect(
      reasonFor(
        stageInput({ candidate: candidate({ sppTotal: 3, unspentSpp: 1 }) }),
      ),
    ).toBe('stored-data-contradicts');
  });

  it('fills a player whose stored unspent SPP is his whole total', () => {
    expect(
      reasonFor(
        stageInput({ candidate: candidate({ sppTotal: 3, unspentSpp: 3 }) }),
      ),
    ).toBeUndefined();
  });

  it('skips a player with a stored gained advancement', () => {
    expect(
      reasonFor(
        stageInput({
          stored: [
            {
              playerId: 1,
              source: 'gained',
              skillId: 200,
              skillName: 'Dodge',
              attributeValue: null,
              isFreeExtra: false,
            },
          ],
        }),
      ),
    ).toBe('stored-data-contradicts');
  });

  describe('check order, first applicable reason wins', () => {
    const ambiguousAndContradicted = (): Partial<InjuryStageInput> => ({
      profile: undefined,
      candidate: candidate({ sppTotal: 3, move: 6 }),
    });

    it('reports uncertain injuries before every other fault', () => {
      proof.prove.mockReturnValue(undefined);

      expect(reasonFor(stageInput(ambiguousAndContradicted()))).toBe(
        'lasting-injury-uncertain',
      );
    });

    it('reports an ambiguous position before a contradiction', () => {
      expect(reasonFor(stageInput(ambiguousAndContradicted()))).toBe(
        'position-ambiguous',
      );
    });

    it('reports an invalid line before a contradiction', () => {
      expect(
        reasonFor(
          stageInput({
            profile: profile({ line: { ma: 6, st: 0, ag: 3, pa: 4, av: 9 } }),
            candidate: candidate({ sppTotal: 3, move: 6 }),
          }),
        ),
      ).toBe('invalid-characteristics');
    });
  });
});
