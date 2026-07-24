import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Decoder } from './match-event-decoders.service';
import { MatchEventDecodersService } from './match-event-decoders.service';
import type { TpMatchEvent } from './match-event-parser.service';
import { MatchEventParserService } from './match-event-parser.service';

/**
 * `MatchEventParserService` itself only validates the top-level shape and
 * dispatches each raw event to whatever `Decoder` `MatchEventDecodersService`
 * registered for its `matchEventType` — the actual per-code decode logic
 * (schema validation, field mapping, error messages) belongs to
 * `MatchEventDecodersService` and is covered in its own dedicated
 * `match-event-decoders.service.spec.ts`. This spec therefore drives
 * `MatchEventDecodersService` with two hand-built canned decoders rather than
 * a real one, so it exercises only `MatchEventParserService`'s own
 * dispatch/validation logic in isolation.
 */
describe('MatchEventParserService', () => {
  let parser: MatchEventParserService;
  let matchEventDecoders: MockProxy<MatchEventDecodersService>;
  let decodeCode4: ReturnType<typeof vi.fn<Decoder>>;
  let decodeCode7: ReturnType<typeof vi.fn<Decoder>>;

  const cannedTouchdown: TpMatchEvent = {
    type: 'touchdown',
    tpEventId: 1,
    instant: 'canned-instant-a',
    lineUpId: 2,
    rosterId: 3,
  };
  const cannedMvp: TpMatchEvent = {
    type: 'mvp_award',
    tpEventId: 10,
    instant: 'canned-instant-b',
    lineUpId: 20,
    rosterId: 30,
  };

  beforeEach(async () => {
    matchEventDecoders = mock<MatchEventDecodersService>();
    decodeCode4 = vi.fn<Decoder>(() => cannedTouchdown);
    decodeCode7 = vi.fn<Decoder>(() => cannedMvp);
    matchEventDecoders.build.mockReturnValue(
      new Map<number, Decoder>([
        [4, decodeCode4],
        [7, decodeCode7],
      ]),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchEventParserService,
        { provide: MatchEventDecodersService, useValue: matchEventDecoders },
      ],
    }).compile();
    parser = moduleRef.get(MatchEventParserService);
  });

  it('builds its decoder table once, from MatchEventDecodersService, at construction', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(matchEventDecoders.build).toHaveBeenCalledTimes(1);
  });

  it('routes a known code to its registered decoder and returns the decoded event', () => {
    const raw = { id: 1, matchEventType: 4, instant: 'x' };
    expect(parser.parse([raw])).toEqual([cannedTouchdown]);
    expect(decodeCode4).toHaveBeenCalledWith(raw);
    expect(decodeCode7).not.toHaveBeenCalled();
  });

  it('routes each raw event to the decoder matching its own matchEventType, preserving input order', () => {
    const rawA = { id: 1, matchEventType: 4 };
    const rawB = { id: 2, matchEventType: 7 };
    expect(parser.parse([rawA, rawB])).toEqual([cannedTouchdown, cannedMvp]);
    expect(decodeCode4).toHaveBeenCalledWith(rawA);
    expect(decodeCode7).toHaveBeenCalledWith(rawB);
  });

  it('drops an entry whose matchEventType has no registered decoder', () => {
    expect(parser.parse([{ id: 1, matchEventType: 999 }])).toEqual([]);
    expect(decodeCode4).not.toHaveBeenCalled();
    expect(decodeCode7).not.toHaveBeenCalled();
  });

  it('drops an entry with no matchEventType field at all', () => {
    expect(parser.parse([{ id: 1 }])).toEqual([]);
  });

  it('drops an entry whose matchEventType is not a number', () => {
    expect(parser.parse([{ id: 1, matchEventType: '4' }])).toEqual([]);
    expect(decodeCode4).not.toHaveBeenCalled();
  });

  it('returns an empty array for an empty input', () => {
    expect(parser.parse([])).toEqual([]);
  });

  it('throws when the input is not an array', () => {
    expect(() => parser.parse({ not: 'an array' })).toThrow();
    expect(() => parser.parse(null)).toThrow();
  });

  it('propagates an Error thrown by a decoder for a known code', () => {
    decodeCode4.mockImplementation(() => {
      throw new Error('Invalid TP match event (code 4): rosterId: Required');
    });
    expect(() => parser.parse([{ id: 1, matchEventType: 4 }])).toThrow(
      /rosterId/,
    );
  });
});
