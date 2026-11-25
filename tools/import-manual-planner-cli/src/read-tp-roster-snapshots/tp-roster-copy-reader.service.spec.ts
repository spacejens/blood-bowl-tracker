import {
  RosterParserService,
  type TpRoster,
  type TpRosterPlayer,
} from '@blood-bowl-tracker/parse-tp';
import { TpFileNameService } from '@blood-bowl-tracker/read-tp-files';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { TpRosterCopyReaderService } from './tp-roster-copy-reader.service';

const SOURCE = 'fourth-era/tloegbbl-chaos-cup-8/rosters_164848.json';
const CONTENT = { any: 'content' };

function roster(overrides: Partial<TpRoster> = {}): TpRoster {
  return {
    id: 164848,
    players: [{ id: 2463398 }, { id: 99 }] as TpRosterPlayer[],
    ...overrides,
  } as TpRoster;
}

describe('TpRosterCopyReaderService', () => {
  let service: TpRosterCopyReaderService;
  let parser: MockProxy<RosterParserService>;

  beforeEach(async () => {
    parser = mock<RosterParserService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRosterCopyReaderService,
        { provide: RosterParserService, useValue: parser },
        TpFileNameService,
      ],
    }).compile();
    service = moduleRef.get(TpRosterCopyReaderService);
  });

  it('reads the era directory, roster id, players in numeric order and newest finish', () => {
    const finishedAt = Date.parse('2026-05-25T10:00:00Z');
    parser.parse.mockReturnValue(roster({ lastMatchFinishedAt: finishedAt }));

    expect(service.read({ source: SOURCE, content: CONTENT })).toEqual({
      kind: 'copy',
      copy: {
        era: 'fourth-era',
        rosterId: '164848',
        source: SOURCE,
        finishedAt,
        playerIds: ['99', '2463398'],
      },
    });
    expect(parser.parse).toHaveBeenCalledWith(CONTENT);
  });

  it('has no finish instant when the parser reads none', () => {
    parser.parse.mockReturnValue(roster());

    const result = service.read({ source: SOURCE, content: CONTENT });

    expect(result.kind === 'copy' && result.copy.finishedAt).toBeNull();
  });

  it('reports a file the parser rejects as unreadable, located by its path', () => {
    parser.parse.mockImplementation(() => {
      throw new Error('Invalid TP roster JSON: lineUps.0.number: Required');
    });

    expect(service.read({ source: SOURCE, content: CONTENT })).toEqual({
      kind: 'unreadable',
      location: { era: 'fourth-era', rosterId: '164848' },
      reason: 'Invalid TP roster JSON: lineUps.0.number: Required',
    });
  });

  it('reports a thrown non-error by its text', () => {
    parser.parse.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the reader must cope with any thrown value
      throw 'odd';
    });

    const result = service.read({ source: SOURCE, content: CONTENT });

    expect(result.kind === 'unreadable' && result.reason).toBe('odd');
  });

  it('locates a copy by its era directory and the roster id in its name', () => {
    expect(service.locate(SOURCE)).toEqual({
      era: 'fourth-era',
      rosterId: '164848',
    });
  });

  it('falls back to the path for a name with no roster id', () => {
    expect(service.locate('e/odd.json')).toEqual({
      era: 'e',
      rosterId: 'e/odd.json',
    });
  });
});
