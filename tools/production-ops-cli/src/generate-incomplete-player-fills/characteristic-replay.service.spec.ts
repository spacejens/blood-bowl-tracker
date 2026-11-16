import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicChangeService } from './characteristic-change.service';
import { CharacteristicReplayService } from './characteristic-replay.service';
import type {
  CharacteristicEvent,
  CharacteristicFormats,
  CharacteristicKey,
  CharacteristicLine,
} from './fill-plan.types';

const LINE: CharacteristicLine = { ma: 6, st: 3, ag: 3, pa: 4, av: 9 };
const TARGET: CharacteristicFormats = {
  ma: 'bare',
  st: 'bare',
  ag: 'plus',
  pa: 'plus_zero_legal',
  av: 'plus',
};
const BARE_LINE: CharacteristicLine = { ma: 6, st: 3, ag: 3, pa: null, av: 8 };
const BARE: CharacteristicFormats = {
  ma: 'bare',
  st: 'bare',
  ag: 'bare',
  pa: 'absent',
  av: 'bare',
};

function increase(
  characteristic: CharacteristicKey,
  at: string,
): CharacteristicEvent {
  return { kind: 'increase', characteristic, at };
}

function reduction(
  characteristic: CharacteristicKey,
  at: string,
): CharacteristicEvent {
  return { kind: 'reduction', characteristic, at };
}

/** Noon UTC on the given day of March 2024. */
function day(date: number): string {
  return `2024-03-${String(date).padStart(2, '0')}T12:00:00+00:00`;
}

describe('CharacteristicReplayService', () => {
  let service: CharacteristicReplayService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CharacteristicReplayService,
        // A pure chain: passed real so the replayed lines are the real ones.
        CharacteristicChangeService,
      ],
    }).compile();
    service = moduleRef.get(CharacteristicReplayService);
  });

  function replay(
    events: CharacteristicEvent[],
    line: CharacteristicLine = LINE,
  ) {
    return service.replay({ line, formats: TARGET, events });
  }

  it('returns the start line without events', () => {
    expect(replay([])).toEqual({ kind: 'replayed', line: LINE });
  });

  it('applies increases without reading their times', () => {
    expect(
      replay([increase('ma', 'not a date'), increase('ma', 'nor this')]),
    ).toEqual({ kind: 'replayed', line: { ...LINE, ma: 8 } });
  });

  it('applies reductions up to the cap of two', () => {
    expect(
      replay([
        reduction('ma', day(1)),
        reduction('ma', day(2)),
        reduction('ma', day(3)),
      ]),
    ).toEqual({ kind: 'replayed', line: { ...LINE, ma: 4 } });
  });

  it('replays an increase before later reductions down to the floor', () => {
    // 2 -> 3 -> 2 -> 1
    expect(
      replay(
        [
          reduction('ma', day(3)),
          increase('ma', day(1)),
          reduction('ma', day(2)),
        ],
        { ...LINE, ma: 2 },
      ),
    ).toEqual({ kind: 'replayed', line: { ...LINE, ma: 1 } });
  });

  it('replays reductions held at the floor before a later increase', () => {
    // 2 -> 1 -> 1 (floor) -> 2
    expect(
      replay(
        [
          increase('ma', day(3)),
          reduction('ma', day(1)),
          reduction('ma', day(2)),
        ],
        { ...LINE, ma: 2 },
      ),
    ).toEqual({ kind: 'replayed', line: { ...LINE, ma: 2 } });
  });

  it('fills a characteristic with an increase and exactly two reductions', () => {
    // 6 -> 5 -> 4 -> 5
    expect(
      replay([
        reduction('ma', day(1)),
        reduction('ma', day(2)),
        increase('ma', day(3)),
      ]),
    ).toEqual({ kind: 'replayed', line: { ...LINE, ma: 5 } });
  });

  it('skips an increase with more reductions than the cap', () => {
    expect(
      replay([
        reduction('ma', day(1)),
        reduction('ma', day(2)),
        increase('ma', day(3)),
        reduction('ma', day(4)),
      ]),
    ).toEqual({ kind: 'order-uncertain' });
  });

  it('replays a target-number AG by its format', () => {
    // 3+ -> 2+ -> 3+
    expect(replay([increase('ag', day(1)), reduction('ag', day(2))])).toEqual({
      kind: 'replayed',
      line: LINE,
    });
  });

  it('accepts a same-day increase and reduction whose orders agree', () => {
    expect(
      replay([
        increase('ma', '2024-03-01T20:00:00+00:00'),
        reduction('ma', '2024-03-01T08:00:00+00:00'),
      ]),
    ).toEqual({ kind: 'replayed', line: LINE });
  });

  it('refuses a same-day increase and reduction whose orders disagree', () => {
    // Increase first: 1 -> 2 -> 1. Reduction first: 1 (floor) -> 2.
    expect(
      replay(
        [
          increase('ma', '2024-03-01T08:00:00+00:00'),
          reduction('ma', '2024-03-01T20:00:00+00:00'),
        ],
        { ...LINE, ma: 1 },
      ),
    ).toEqual({ kind: 'order-uncertain' });
  });

  it('groups events by their UTC day, whatever their offset', () => {
    // Both on 2 March UTC.
    expect(
      replay(
        [
          increase('ma', '2024-03-02T00:30:00+00:00'),
          reduction('ma', '2024-03-01T23:30:00-02:00'),
        ],
        { ...LINE, ma: 1 },
      ),
    ).toEqual({ kind: 'order-uncertain' });
  });

  it('orders events on different UTC days, though their local dates match', () => {
    // Increase on 1 March UTC, reduction on 2 March UTC: 1 -> 2 -> 1.
    expect(
      replay(
        [
          increase('ma', '2024-03-01T23:00:00+00:00'),
          reduction('ma', '2024-03-01T22:30:00-02:00'),
        ],
        { ...LINE, ma: 1 },
      ),
    ).toEqual({ kind: 'replayed', line: { ...LINE, ma: 1 } });
  });

  it('never lets events on different characteristics interact', () => {
    expect(
      replay([increase('ma', day(1)), reduction('av', day(1))], {
        ...LINE,
        ma: 1,
      }),
    ).toEqual({ kind: 'replayed', line: { ...LINE, ma: 2, av: 8 } });
  });

  it('cannot apply an increase past the best value', () => {
    expect(replay([increase('ag', day(1))], { ...LINE, ag: 1 })).toEqual({
      kind: 'unapplicable',
    });
  });

  it('refuses events an increase fails for in only some orders', () => {
    // Two increases first fail at 1+; the orders with the reduction earlier give 1+.
    expect(
      replay(
        [
          increase('ag', day(1)),
          increase('ag', day(1)),
          reduction('ag', day(1)),
        ],
        { ...LINE, ag: 2 },
      ),
    ).toEqual({ kind: 'order-uncertain' });
  });

  it('cannot apply when a later day fails in every order after an earlier uncertain day', () => {
    expect(
      replay(
        [
          increase('ag', day(1)),
          increase('ag', day(1)),
          reduction('ag', day(1)),
          increase('ag', day(2)),
        ],
        { ...LINE, ag: 2 },
      ),
    ).toEqual({ kind: 'unapplicable' });
  });

  it('cannot apply events an increase fails for in every order', () => {
    expect(
      service.replay({
        line: BARE_LINE,
        formats: BARE,
        events: [increase('pa', day(1)), reduction('pa', day(1))],
      }),
    ).toEqual({ kind: 'unapplicable' });
  });

  it('refuses an increase and a reduction when a time does not parse', () => {
    expect(
      replay([increase('ma', 'not a date'), reduction('ma', day(1))]),
    ).toEqual({ kind: 'order-uncertain' });
  });

  it('reports the first characteristic that fails', () => {
    expect(
      replay(
        [
          increase('ma', '2024-03-01T08:00:00+00:00'),
          reduction('ma', '2024-03-01T20:00:00+00:00'),
          increase('ag', day(1)),
        ],
        { ...LINE, ma: 1, ag: 1 },
      ),
    ).toEqual({ kind: 'order-uncertain' });
  });
});
