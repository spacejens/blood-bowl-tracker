import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  CharacteristicFormats,
  LastingInjuryRepairCandidate,
} from './fill-plan.types';
import { LastingInjuryRepairSelectorService } from './lasting-injury-repair-selector.service';

const BB2020: CharacteristicFormats = {
  ma: 'bare',
  st: 'bare',
  ag: 'plus',
  pa: 'plus',
  av: 'plus',
};

const START = { ma: 6, st: 3, ag: 3, pa: 4, av: 9 };

function candidate(
  overrides: Partial<LastingInjuryRepairCandidate> = {},
): LastingInjuryRepairCandidate {
  return {
    player: { system: 'tourplay.net', id: '929761' },
    line: { ...START },
    increases: [],
    context: { formats: BB2020, baseline: { ...START } },
    ...overrides,
  };
}

describe('LastingInjuryRepairSelectorService', () => {
  let selector: LastingInjuryRepairSelectorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [LastingInjuryRepairSelectorService],
    }).compile();
    selector = moduleRef.get(LastingInjuryRepairSelectorService);
  });

  describe('derive', () => {
    it('counts a value one worse than the start value as one reduction', () => {
      expect(selector.derive(candidate({ line: { ...START, av: 8 } }))).toEqual(
        { ma: 0, st: 0, ag: 0, pa: 0, av: 1 },
      );
    });

    it('counts an increase undone by a reduction as one', () => {
      expect(selector.derive(candidate({ increases: ['ma'] }))).toEqual({
        ma: 1,
        st: 0,
        ag: 0,
        pa: 0,
        av: 0,
      });
    });

    it('treats a lower value as better for AG and PA in a target-number format', () => {
      expect(
        selector.derive(candidate({ line: { ...START, ag: 4, pa: 5 } })),
      ).toEqual({ ma: 0, st: 0, ag: 1, pa: 1, av: 0 });
      expect(selector.derive(candidate({ line: { ...START, ag: 2 } }))).toEqual(
        { ma: 0, st: 0, ag: 0, pa: 0, av: 0 },
      );
    });

    it('treats a higher value as better for AG under a bare format', () => {
      const context = {
        formats: { ...BB2020, ag: 'bare' as const },
        baseline: { ...START },
      };
      expect(
        selector.derive(candidate({ context, line: { ...START, ag: 2 } })),
      ).toEqual({ ma: 0, st: 0, ag: 1, pa: 0, av: 0 });
    });

    it('records none for a value better than the start value', () => {
      expect(selector.derive(candidate({ line: { ...START, st: 4 } }))).toEqual(
        { ma: 0, st: 0, ag: 0, pa: 0, av: 0 },
      );
    });

    it('skips an absent format, a null value and a null start value', () => {
      const context = {
        formats: { ...BB2020, av: 'absent' as const },
        baseline: { ...START, pa: null },
      };
      expect(
        selector.derive(
          candidate({
            context,
            line: { ...START, pa: 5, av: 8 },
          }),
        ),
      ).toEqual({ ma: 0, st: 0, ag: 0, pa: 0, av: 0 });
      expect(
        selector.derive(
          candidate({ line: { ...START, pa: null }, increases: ['pa'] }),
        ),
      ).toEqual({ ma: 0, st: 0, ag: 0, pa: 0, av: 0 });
    });

    it('records none without a start line or a rules set', () => {
      const reduced = { ...START, av: 8 };
      expect(
        selector.derive(
          candidate({
            line: reduced,
            context: { formats: BB2020, baseline: null },
          }),
        ),
      ).toEqual({ ma: 0, st: 0, ag: 0, pa: 0, av: 0 });
      expect(
        selector.derive(candidate({ line: reduced, context: null })),
      ).toEqual({ ma: 0, st: 0, ag: 0, pa: 0, av: 0 });
    });
  });

  describe('select', () => {
    it('keeps only the players the server would record a reduction for, as entries', () => {
      const healed = candidate({ player: { system: 'tourplay.net', id: '1' } });
      const reduced = candidate({
        player: { system: 'tourplay.net', id: '2' },
        line: { ...START, av: 8 },
      });

      expect(selector.select([healed, reduced])).toEqual([
        { player: { system: 'tourplay.net', id: '2' } },
      ]);
    });
  });
});
