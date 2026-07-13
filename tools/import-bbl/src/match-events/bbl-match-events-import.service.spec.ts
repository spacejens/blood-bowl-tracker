import type {
  MatchEventsImportService,
  TeamsImportService,
  UpsertCompetitionData,
  UpsertMatchEventData,
  UpsertTeamData,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { BblMatchEvents } from '../matches/match-events-page-parser';
import { BblMatchEventsImportService } from './bbl-match-events-import.service';
import { BblMatchEventsReaderService } from './bbl-match-events-reader.service';

const MATCH_BBL_ID = '89';
const MATCH_DB_ID = 42;
const HOME_TEAM_ERA_ID = 1000;
const AWAY_TEAM_ERA_ID = 2000;
const BBL_SYSTEM_ID = 1;

const competition: UpsertCompetitionData = {
  name: 'Major Season 3',
  type: 'season',
  eraId: 200,
  teamEraIds: [],
  externalIds: [{ externalSystemId: BBL_SYSTEM_ID, externalId: '3' }],
};

const homeTeam: UpsertTeamData = {
  name: 'Home',
  raceId: 70,
  coachId: 9,
  eras: [],
  externalIds: [],
};
const awayTeam: UpsertTeamData = {
  name: 'Away',
  raceId: 71,
  coachId: 10,
  eras: [],
  externalIds: [],
};

function makeEvents(
  parts: Partial<Pick<BblMatchEvents, 'actions' | 'consequences'>>,
): BblMatchEvents {
  return {
    bblId: MATCH_BBL_ID,
    homeTeamId: 'hme',
    awayTeamId: 'awy',
    actions: parts.actions ?? [],
    consequences: parts.consequences ?? [],
  };
}

function makeMatchListReader() {
  const reader = new BblMatchListReaderService({} as never, {} as never);
  vi.spyOn(reader, 'getMatchesByCompetitionId').mockResolvedValue(
    new Map([['3', [{ bblId: MATCH_BBL_ID, date: new Date(0) }]]]),
  );
  return reader;
}

function makeEventsReader(events: BblMatchEvents) {
  const reader = new BblMatchEventsReaderService({} as never, {} as never);
  vi.spyOn(reader, 'getMatchEventsByBblId').mockResolvedValue(
    new Map([[events.bblId, events]]),
  );
  return reader;
}

async function runImport(
  events: BblMatchEvents,
  playerIds: Record<string, number> = {},
  overrides: {
    matchIdsByBblId?: Map<string, number>;
    teamsByCode?: Map<string, UpsertTeamData>;
    upsertTeam?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const captured: UpsertMatchEventData[] = [];
  const upsertMatchEvent = vi.fn((data: UpsertMatchEventData) => {
    captured.push(data);
    return Promise.resolve(true);
  });
  const upsertTeam =
    overrides.upsertTeam ??
    vi.fn((data: UpsertTeamData) => {
      const id = data.name === 'Home' ? HOME_TEAM_ERA_ID : AWAY_TEAM_ERA_ID;
      return Promise.resolve({ eras: [{ id, eraId: data.eras?.[0] }] });
    });

  const service = new BblMatchEventsImportService(
    makeMatchListReader(),
    makeEventsReader(events),
    { upsertTeam } as unknown as TeamsImportService,
    { upsertMatchEvent } as unknown as MatchEventsImportService,
  );

  const { result } = await service.importMatchEvents(
    new Map([['3', competition]]),
    overrides.teamsByCode ??
      new Map([
        ['hme', homeTeam],
        ['awy', awayTeam],
      ]),
    overrides.matchIdsByBblId ?? new Map([[MATCH_BBL_ID, MATCH_DB_ID]]),
    new Map(Object.entries(playerIds)),
  );

  return { captured, result, upsertTeam, upsertMatchEvent };
}

function externalIds(captured: UpsertMatchEventData[]): string[] {
  return captured.map((c) => c.externalIds[0].externalId);
}

describe('BblMatchEventsImportService', () => {
  it('scenario 1: a home hattrick yields td-0, td-1, td-2 occurrence ids', async () => {
    const { captured } = await runImport(
      makeEvents({
        actions: [
          { actionType: 'touchdown', side: 'home', pid: 'p1' },
          { actionType: 'touchdown', side: 'home', pid: 'p2' },
          { actionType: 'touchdown', side: 'home', pid: 'p3' },
        ],
      }),
      { p1: 11, p2: 12, p3: 13 },
    );

    expect(externalIds(captured)).toEqual([
      '89-hme-td-0',
      '89-hme-td-1',
      '89-hme-td-2',
    ]);
    expect(captured[0]).toMatchObject({
      matchId: MATCH_DB_ID,
      actionType: 'touchdown',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      actingPlayerId: 11,
    });
    expect(captured[0].consequenceType).toBeUndefined();
    expect(captured[2].actingPlayerId).toBe(13);
  });

  it('scenario 2: one death action + one death consequence merge into a single event', async () => {
    const { captured } = await runImport(
      makeEvents({
        actions: [{ actionType: 'death', side: 'home', pid: 'killer' }],
        consequences: [
          { consequenceType: 'death', side: 'away', pid: 'victim' },
        ],
      }),
      { killer: 7, victim: 8 },
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      matchId: MATCH_DB_ID,
      actionType: 'death',
      consequenceType: 'death',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      consequenceTeamEraId: AWAY_TEAM_ERA_ID,
      actingPlayerId: 7,
      consequencePlayerId: 8,
      externalIds: [
        { externalSystemId: BBL_SYSTEM_ID, externalId: '89-hme-death-0' },
      ],
    });
  });

  it('scenario 3: two serious_injury actions + one matching consequence do not merge', async () => {
    const { captured } = await runImport(
      makeEvents({
        actions: [
          { actionType: 'serious_injury', side: 'home', pid: 'a1' },
          { actionType: 'serious_injury', side: 'home', pid: 'a2' },
        ],
        consequences: [
          { consequenceType: 'miss_next_game', side: 'away', pid: 'v1' },
        ],
      }),
      { a1: 1, a2: 2, v1: 3 },
    );

    expect(captured).toHaveLength(3);
    // Two action-only serious-injury events on the home side.
    expect(captured[0]).toMatchObject({
      actionType: 'serious_injury',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      actingPlayerId: 1,
    });
    expect(captured[0].consequenceType).toBeUndefined();
    expect(captured[1]).toMatchObject({
      actionType: 'serious_injury',
      actingPlayerId: 2,
    });
    // One consequence-only miss-next-game event on the away side.
    expect(captured[2]).toMatchObject({
      consequenceType: 'miss_next_game',
      consequenceTeamEraId: AWAY_TEAM_ERA_ID,
      consequencePlayerId: 3,
    });
    expect(captured[2].actionType).toBeUndefined();
    expect(externalIds(captured)).toEqual([
      '89-hme-serious-0',
      '89-hme-serious-1',
      '89-awy-miss-next-game-0',
    ]);
  });

  it('scenario 4: a foul with no consequence yields one action-only event', async () => {
    const { captured } = await runImport(
      makeEvents({
        actions: [{ actionType: 'foul', side: 'home', pid: 'f1' }],
      }),
      { f1: 5 },
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      matchId: MATCH_DB_ID,
      actionType: 'foul',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      actingPlayerId: 5,
      externalIds: [
        { externalSystemId: BBL_SYSTEM_ID, externalId: '89-hme-foul-0' },
      ],
    });
  });

  it('scenario 5: a consequence-only event with a null pid still gets an external id', async () => {
    const { captured } = await runImport(
      makeEvents({
        consequences: [{ consequenceType: 'death', side: 'away', pid: null }],
      }),
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      matchId: MATCH_DB_ID,
      consequenceType: 'death',
      consequenceTeamEraId: AWAY_TEAM_ERA_ID,
      externalIds: [
        { externalSystemId: BBL_SYSTEM_ID, externalId: '89-awy-death-0' },
      ],
    });
    expect(captured[0].consequencePlayerId).toBeUndefined();
  });

  it('scenario 6: re-running produces identical, deterministic external ids', async () => {
    const events = makeEvents({
      actions: [
        { actionType: 'touchdown', side: 'home', pid: 'p1' },
        { actionType: 'foul', side: 'away', pid: 'p2' },
      ],
      consequences: [{ consequenceType: 'sent_off', side: 'away', pid: 'p2' }],
    });
    const first = await runImport(events, { p1: 1, p2: 2 });
    const second = await runImport(events, { p1: 1, p2: 2 });

    expect(externalIds(first.captured)).toEqual(externalIds(second.captured));
    expect(externalIds(first.captured)).toEqual([
      '89-hme-td-0',
      '89-awy-foul-0',
      '89-awy-sent-off-0',
    ]);
  });

  it('records a non-fatal error but still emits the event when a pid has no imported id', async () => {
    const { captured, result } = await runImport(
      makeEvents({
        actions: [{ actionType: 'touchdown', side: 'home', pid: 'ghost' }],
      }),
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].actingPlayerId).toBeUndefined();
    expect(captured[0].externalIds[0].externalId).toBe('89-hme-td-0');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('counts each emitted event as imported', async () => {
    const { result } = await runImport(
      makeEvents({
        actions: [
          { actionType: 'touchdown', side: 'home', pid: 'p1' },
          { actionType: 'touchdown', side: 'home', pid: 'p2' },
        ],
      }),
      { p1: 1, p2: 2 },
    );

    expect(result.imported).toBe(2);
    expect(result.success).toBe(true);
  });

  it('records an error and skips a match with no imported id', async () => {
    const { captured, result, upsertMatchEvent } = await runImport(
      makeEvents({
        actions: [{ actionType: 'touchdown', side: 'home', pid: 'p1' }],
      }),
      { p1: 1 },
      { matchIdsByBblId: new Map() },
    );

    expect(captured).toHaveLength(0);
    expect(upsertMatchEvent).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('no imported match id');
  });

  it('records an error and skips a match whose team code does not resolve', async () => {
    const { captured, result, upsertMatchEvent } = await runImport(
      makeEvents({
        actions: [{ actionType: 'touchdown', side: 'home', pid: 'p1' }],
      }),
      { p1: 1 },
      { teamsByCode: new Map([['hme', homeTeam]]) },
    );

    expect(captured).toHaveLength(0);
    expect(upsertMatchEvent).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('could not resolve both')),
    ).toBe(true);
    expect(result.errors.some((e) => e.message.includes('"awy"'))).toBe(true);
  });

  it('records an error and skips a match when a team upsert resolves to no era', async () => {
    const { captured, result } = await runImport(
      makeEvents({
        actions: [{ actionType: 'touchdown', side: 'home', pid: 'p1' }],
      }),
      { p1: 1 },
      { upsertTeam: vi.fn().mockResolvedValue(undefined) },
    );

    expect(captured).toHaveLength(0);
    expect(
      result.errors.some((e) => e.message.includes('could not resolve both')),
    ).toBe(true);
  });
});
