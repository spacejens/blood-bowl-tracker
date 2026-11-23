import {
  ParseTpModule,
  RosterParserService,
} from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpRosterCopyReaderService } from './tp-roster-copy-reader.service';

/**
 * A roster both readers accept: packages/parse-tp's spec roster with two
 * players. parse-tp's RosterParserService is what the TP import reads a
 * copy's finish instant and players with, so it runs real here on purpose.
 */
function rosterBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const lineUp = (id: number, number: number) => ({
    id,
    name: `Player ${id}`,
    number,
    lineUpMasterId: 952,
    rosterId: 123,
    position: 'Dwarf Lineman',
    isBigGuy: false,
    totalStarPlayerPoints: 23,
  });
  return {
    id: 123,
    teamName: 'The Dwarf Team',
    teamRace: 'Dwarf_BB2025',
    player: { applicationUserId: 'guid-coach-1', userNameToShow: 'Coach One' },
    lineUps: [lineUp(2412443, 1), lineUp(7, 2)],
    rosterMaster: {
      name: 'Dwarf',
      starPlayersMasters: [],
      lineUpMasters: [
        {
          id: 952,
          position: 'Dwarf Lineman',
          ma: 5,
          st: 3,
          ag: 4,
          pa: 6,
          av: 9,
        },
      ],
    },
    ...overrides,
  };
}

const finished = (...instants: unknown[]) =>
  instants.map((finishInstant) => ({ scores: [{ finishInstant }] }));

const CASES: { name: string; lastMatches?: unknown }[] = [
  { name: 'no lastMatches' },
  { name: 'an empty lastMatches', lastMatches: [] },
  {
    name: 'instants with offsets and fractions',
    lastMatches: finished(
      '2026-02-24T19:14:21.4342804+00:00',
      '2026-05-25T10:00:00+02:00',
      '2026-03-01T10:00:00Z',
    ),
  },
  {
    name: 'null, missing and unparseable instants',
    lastMatches: [
      { scores: [] },
      { scores: [{ finishInstant: null }] },
      {},
      ...finished('not a date', '2026-05-25T10:00:00Z'),
    ],
  },
  { name: 'a malformed lastMatches', lastMatches: 'oops' },
  {
    name: 'malformed scores',
    lastMatches: [{ scores: 'oops' }, { scores: [{ finishInstant: 5 }] }],
  },
];

describe('TpRosterCopyReaderService against packages/parse-tp', () => {
  let reader: TpRosterCopyReaderService;
  let parser: RosterParserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ParseTpModule],
      providers: [TpRosterCopyReaderService],
    }).compile();
    reader = moduleRef.get(TpRosterCopyReaderService);
    parser = moduleRef.get(RosterParserService);
  });

  it.each(CASES)(
    'reads the finish instant and players parse-tp reads, with $name',
    ({ lastMatches }) => {
      const content = rosterBody(
        lastMatches === undefined ? {} : { lastMatches },
      );
      const parsed = parser.parse(content);

      const result = reader.read({
        source: 'fourth-era/c/rosters_123.json',
        content,
      });

      expect(result.kind).toBe('copy');
      expect(result.kind === 'copy' && result.copy).toMatchObject({
        rosterId: String(parsed.id),
        finishedAt: parsed.lastMatchFinishedAt ?? null,
        playerIds: parsed.players
          .map((player) => String(player.id))
          .sort((a, b) => Number(a) - Number(b)),
      });
    },
  );
});
