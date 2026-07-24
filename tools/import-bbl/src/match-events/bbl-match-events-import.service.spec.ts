import type {
  UpsertMatchEvent,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  MatchEventsImportService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { BblMatchEvents } from '../matches/match-events-page-parser';
import type { MatchMergeResolution } from '../matches/match-merge.service';
import { MatchMergeService } from '../matches/match-merge.service';
import { BblMatchEventsImportService } from './bbl-match-events-import.service';
import {
  AWAY_TEAM_ERA_ID,
  awayTeam,
  BBL_SYSTEM_ID,
  combineOccurrencesLike,
  competition,
  correlateEventsLike,
  HOME_TEAM_ERA_ID,
  homeTeam,
  makeEvents,
  makeTeamRecord,
  MATCH_BBL_ID,
  MATCH_DB_ID,
} from './bbl-match-events-import.test-helpers';
import { BblMatchEventsReaderService } from './bbl-match-events-reader.service';
import { MatchEventCorrelationService } from './match-event-correlation.service';

/** A resolution with no merged pairs: every match imports independently. */
function noMergeResolution(): MatchMergeResolution {
  return {
    primaryBblIdByBblId: new Map(),
    partnerBblId: () => undefined,
    isPrimary: () => false,
    isSecondary: () => false,
    effectivePlayedAt: (_bblId, rawDate) => rawDate,
  };
}

interface Mocks {
  matchListReader: MockProxy<BblMatchListReaderService>;
  eventsReader: MockProxy<BblMatchEventsReaderService>;
  teamsImport: MockProxy<TeamsImportService>;
  matchEventsImport: MockProxy<MatchEventsImportService>;
  matchMerge: MockProxy<MatchMergeService>;
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. MatchEventCorrelationService's `combineOccurrences`
 * and `correlateEvents` mirror its real, deterministic logic exactly (see
 * bbl-match-events-import.test-helpers.ts), so a regression in either the
 * service under test or that mirrored logic still fails these tests; the
 * correlation logic itself has its own dedicated spec
 * (match-event-correlation.service.spec.ts).
 */
async function makeService(): Promise<{
  service: BblMatchEventsImportService;
  mocks: Mocks;
}> {
  const matchListReader = mock<BblMatchListReaderService>();

  const eventsReader = mock<BblMatchEventsReaderService>();

  const teamsImport = mock<TeamsImportService>();

  const matchEventsImport = mock<MatchEventsImportService>();

  const matchMerge = mock<MatchMergeService>();
  matchMerge.resolve.mockResolvedValue(noMergeResolution());

  const correlation = mock<MatchEventCorrelationService>();
  correlation.combineOccurrences.mockImplementation((...sources) =>
    combineOccurrencesLike(...sources),
  );
  correlation.correlateEvents.mockImplementation((combined) =>
    correlateEventsLike(combined),
  );

  const importResults = mock<ImportResultService>();
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockImplementation((args) => ({
    success: args.errors.length === 0,
    imported: args.imported,
    errors: args.errors,
  }));

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblMatchEventsImportService,
      { provide: BblMatchListReaderService, useValue: matchListReader },
      { provide: BblMatchEventsReaderService, useValue: eventsReader },
      { provide: TeamsImportService, useValue: teamsImport },
      { provide: MatchEventsImportService, useValue: matchEventsImport },
      { provide: MatchMergeService, useValue: matchMerge },
      { provide: MatchEventCorrelationService, useValue: correlation },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblMatchEventsImportService),
    mocks: {
      matchListReader,
      eventsReader,
      teamsImport,
      matchEventsImport,
      matchMerge,
    },
  };
}

type UpsertTeamImpl = (
  data: UpsertTeam,
) => Promise<ReturnType<typeof makeTeamRecord> | undefined>;

async function runImport(
  events: BblMatchEvents,
  playerIds: Record<string, number> = {},
  overrides: {
    matchIdsByBblId?: Map<string, number>;
    teamsByCode?: Map<string, UpsertTeam>;
    upsertTeam?: UpsertTeamImpl;
  } = {},
) {
  const { service, mocks } = await makeService();
  mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
    new Map([['3', [{ bblId: MATCH_BBL_ID, date: new Date(0) }]]]),
  );
  mocks.eventsReader.getMatchEventsByBblId.mockResolvedValue(
    new Map([[events.bblId, events]]),
  );

  const captured: UpsertMatchEvent[] = [];
  mocks.matchEventsImport.upsertMatchEvent.mockImplementation((data) => {
    captured.push(data);
    return Promise.resolve(true);
  });
  mocks.teamsImport.upsertTeam.mockImplementation(
    overrides.upsertTeam ??
      ((data) => {
        const id = data.name === 'Home' ? HOME_TEAM_ERA_ID : AWAY_TEAM_ERA_ID;
        return Promise.resolve(
          makeTeamRecord([{ id, eraId: data.eras?.[0] ?? 0 }]),
        );
      }),
  );

  const { result } = await service.importMatchEvents({
    competitionsByBblId: new Map([['3', competition]]),
    teamsByCode:
      overrides.teamsByCode ??
      new Map([
        ['hme', homeTeam],
        ['awy', awayTeam],
      ]),
    matchIdsByBblId:
      overrides.matchIdsByBblId ?? new Map([[MATCH_BBL_ID, MATCH_DB_ID]]),
    playerIdsByPid: new Map(Object.entries(playerIds)),
  });

  return { captured, result, mocks };
}

function externalIds(captured: UpsertMatchEvent[]): string[] {
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
    const { captured, result, mocks } = await runImport(
      makeEvents({
        actions: [{ actionType: 'touchdown', side: 'home', pid: 'p1' }],
      }),
      { p1: 1 },
      { matchIdsByBblId: new Map() },
    );

    expect(captured).toHaveLength(0);
    expect(mocks.matchEventsImport.upsertMatchEvent).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('no imported match id');
  });

  it('records an error and skips a match whose team code does not resolve', async () => {
    const { captured, result, mocks } = await runImport(
      makeEvents({
        actions: [{ actionType: 'touchdown', side: 'home', pid: 'p1' }],
      }),
      { p1: 1 },
      { teamsByCode: new Map([['hme', homeTeam]]) },
    );

    expect(captured).toHaveLength(0);
    expect(mocks.matchEventsImport.upsertMatchEvent).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('could not resolve all')),
    ).toBe(true);
    expect(result.errors.some((e) => e.message.includes('"awy"'))).toBe(true);
  });

  it('records an error and skips a match when a team upsert resolves to no era', async () => {
    const { captured, result } = await runImport(
      makeEvents({
        actions: [{ actionType: 'touchdown', side: 'home', pid: 'p1' }],
      }),
      { p1: 1 },
      { upsertTeam: () => Promise.resolve(undefined) },
    );

    expect(captured).toHaveLength(0);
    expect(
      result.errors.some((e) => e.message.includes('could not resolve all')),
    ).toBe(true);
  });

  it('scenario merge: a casualty action in source A pairs with a Sustained-Injury consequence in source B', async () => {
    const PRIMARY = '1061';
    const SECONDARY = '1062';

    const eventsA: BblMatchEvents = {
      bblId: PRIMARY,
      homeTeamId: 'a1',
      awayTeamId: 'a2',
      actions: [
        { actionType: 'serious_injury', side: 'home', pid: 'attacker' },
      ],
      consequences: [],
    };
    const eventsB: BblMatchEvents = {
      bblId: SECONDARY,
      homeTeamId: 'b1',
      awayTeamId: 'b2',
      actions: [],
      consequences: [
        { consequenceType: 'miss_next_game', side: 'home', pid: 'victim' },
      ],
    };

    const teamsByCode = new Map<string, UpsertTeam>([
      ['a1', { name: 'A1', raceId: 1, coachId: 1, eras: [], externalIds: [] }],
      ['a2', { name: 'A2', raceId: 2, coachId: 1, eras: [], externalIds: [] }],
      ['b1', { name: 'B1', raceId: 3, coachId: 1, eras: [], externalIds: [] }],
      ['b2', { name: 'B2', raceId: 4, coachId: 1, eras: [], externalIds: [] }],
    ]);
    const eraIdByName: Record<string, number> = {
      a1: 101,
      a2: 102,
      b1: 103,
      b2: 104,
    };

    const { service, mocks } = await makeService();
    mocks.teamsImport.upsertTeam.mockImplementation((data) =>
      Promise.resolve(
        makeTeamRecord([
          {
            id: eraIdByName[data.name.toLowerCase()],
            eraId: data.eras?.[0] ?? 0,
          },
        ]),
      ),
    );
    const captured: UpsertMatchEvent[] = [];
    mocks.matchEventsImport.upsertMatchEvent.mockImplementation((data) => {
      captured.push(data);
      return Promise.resolve(true);
    });
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      new Map([
        [
          '32',
          [
            { bblId: PRIMARY, date: new Date(Date.UTC(2016, 8, 25)) },
            { bblId: SECONDARY, date: new Date(Date.UTC(2016, 8, 24)) },
          ],
        ],
      ]),
    );
    mocks.eventsReader.getMatchEventsByBblId.mockResolvedValue(
      new Map([
        [PRIMARY, eventsA],
        [SECONDARY, eventsB],
      ]),
    );
    mocks.matchMerge.resolve.mockResolvedValue({
      primaryBblIdByBblId: new Map([
        [PRIMARY, PRIMARY],
        [SECONDARY, PRIMARY],
      ]),
      partnerBblId: (bblId) =>
        bblId === PRIMARY
          ? SECONDARY
          : bblId === SECONDARY
            ? PRIMARY
            : undefined,
      isPrimary: (bblId) => bblId === PRIMARY,
      isSecondary: (bblId) => bblId === SECONDARY,
      effectivePlayedAt: (_bblId, rawDate) => rawDate,
    });

    const { result } = await service.importMatchEvents({
      competitionsByBblId: new Map([
        [
          '32',
          {
            ...competition,
            externalIds: [
              { externalSystemId: BBL_SYSTEM_ID, externalId: '32' },
            ],
          },
        ],
      ]),
      teamsByCode,
      // Both source ids point at the same DB match id, per Task 3.
      matchIdsByBblId: new Map([
        [PRIMARY, MATCH_DB_ID],
        [SECONDARY, MATCH_DB_ID],
      ]),
      playerIdsByPid: new Map([
        ['attacker', 900],
        ['victim', 901],
      ]),
    });

    expect(result.success).toBe(true);
    // Exactly one merged event: action from A (team a1) + consequence from B (team b1).
    const merged = captured.filter(
      (c) => c.actionType !== undefined && c.consequenceType !== undefined,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      matchId: MATCH_DB_ID,
      actionType: 'serious_injury',
      consequenceType: 'miss_next_game',
      actingTeamEraId: 101,
      consequenceTeamEraId: 103,
      actingPlayerId: 900,
      consequencePlayerId: 901,
    });
    // External id uses the ACTION's source bblId + team code.
    expect(merged[0].externalIds[0].externalId).toBe('1061-a1-serious-0');
    // The secondary match is not processed on its own (no standalone events).
    expect(captured).toHaveLength(1);
  });

  it('scenario merge: primary events page missing still imports the secondary partner occurrences', async () => {
    const PRIMARY = '1061';
    const SECONDARY = '1062';

    const eventsB: BblMatchEvents = {
      bblId: SECONDARY,
      homeTeamId: 'b1',
      awayTeamId: 'b2',
      actions: [],
      consequences: [
        { consequenceType: 'miss_next_game', side: 'home', pid: 'victim' },
      ],
    };

    const teamsByCode = new Map<string, UpsertTeam>([
      ['a1', { name: 'A1', raceId: 1, coachId: 1, eras: [], externalIds: [] }],
      ['a2', { name: 'A2', raceId: 2, coachId: 1, eras: [], externalIds: [] }],
      ['b1', { name: 'B1', raceId: 3, coachId: 1, eras: [], externalIds: [] }],
      ['b2', { name: 'B2', raceId: 4, coachId: 1, eras: [], externalIds: [] }],
    ]);
    const eraIdByName: Record<string, number> = {
      a1: 101,
      a2: 102,
      b1: 103,
      b2: 104,
    };

    const { service, mocks } = await makeService();
    mocks.teamsImport.upsertTeam.mockImplementation((data) =>
      Promise.resolve(
        makeTeamRecord([
          {
            id: eraIdByName[data.name.toLowerCase()],
            eraId: data.eras?.[0] ?? 0,
          },
        ]),
      ),
    );
    const captured: UpsertMatchEvent[] = [];
    mocks.matchEventsImport.upsertMatchEvent.mockImplementation((data) => {
      captured.push(data);
      return Promise.resolve(true);
    });
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      new Map([
        [
          '32',
          [
            { bblId: PRIMARY, date: new Date(Date.UTC(2016, 8, 25)) },
            { bblId: SECONDARY, date: new Date(Date.UTC(2016, 8, 24)) },
          ],
        ],
      ]),
    );
    // PRIMARY's own events page is missing (e.g. failed to fetch/parse); only
    // SECONDARY's page is present in the map.
    mocks.eventsReader.getMatchEventsByBblId.mockResolvedValue(
      new Map([[SECONDARY, eventsB]]),
    );
    mocks.matchMerge.resolve.mockResolvedValue({
      primaryBblIdByBblId: new Map([
        [PRIMARY, PRIMARY],
        [SECONDARY, PRIMARY],
      ]),
      partnerBblId: (bblId) =>
        bblId === PRIMARY
          ? SECONDARY
          : bblId === SECONDARY
            ? PRIMARY
            : undefined,
      isPrimary: (bblId) => bblId === PRIMARY,
      isSecondary: (bblId) => bblId === SECONDARY,
      effectivePlayedAt: (_bblId, rawDate) => rawDate,
    });

    const { result } = await service.importMatchEvents({
      competitionsByBblId: new Map([
        [
          '32',
          {
            ...competition,
            externalIds: [
              { externalSystemId: BBL_SYSTEM_ID, externalId: '32' },
            ],
          },
        ],
      ]),
      teamsByCode,
      // Both source ids point at the same DB match id, so there IS an
      // imported matchId; only the events data is missing for PRIMARY.
      matchIdsByBblId: new Map([
        [PRIMARY, MATCH_DB_ID],
        [SECONDARY, MATCH_DB_ID],
      ]),
      playerIdsByPid: new Map([['victim', 901]]),
    });

    expect(result.success).toBe(true);
    // The secondary partner's occurrence must not be silently dropped just
    // because the primary's own events page is missing.
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      matchId: MATCH_DB_ID,
      consequenceType: 'miss_next_game',
      consequenceTeamEraId: 103,
      consequencePlayerId: 901,
    });
    expect(captured[0].actionType).toBeUndefined();
    expect(captured[0].externalIds[0].externalId).toBe(
      '1062-b1-miss-next-game-0',
    );
  });

  it('scenario merge ambiguous: two candidate victims across the pair fall through to independent events', async () => {
    const PRIMARY = '1518';
    const SECONDARY = '1519';

    const eventsA: BblMatchEvents = {
      bblId: PRIMARY,
      homeTeamId: 'a1',
      awayTeamId: 'a2',
      actions: [
        { actionType: 'serious_injury', side: 'home', pid: 'attacker' },
      ],
      consequences: [
        { consequenceType: 'miss_next_game', side: 'away', pid: 'victim1' },
      ],
    };
    const eventsB: BblMatchEvents = {
      bblId: SECONDARY,
      homeTeamId: 'b1',
      awayTeamId: 'b2',
      actions: [],
      consequences: [
        { consequenceType: 'miss_next_game', side: 'home', pid: 'victim2' },
      ],
    };

    const teamsByCode = new Map<string, UpsertTeam>([
      ['a1', { name: 'A1', raceId: 1, coachId: 1, eras: [], externalIds: [] }],
      ['a2', { name: 'A2', raceId: 2, coachId: 1, eras: [], externalIds: [] }],
      ['b1', { name: 'B1', raceId: 3, coachId: 1, eras: [], externalIds: [] }],
      ['b2', { name: 'B2', raceId: 4, coachId: 1, eras: [], externalIds: [] }],
    ]);
    const eraIdByName: Record<string, number> = {
      a1: 101,
      a2: 102,
      b1: 103,
      b2: 104,
    };

    const { service, mocks } = await makeService();
    mocks.teamsImport.upsertTeam.mockImplementation((data) =>
      Promise.resolve(
        makeTeamRecord([
          {
            id: eraIdByName[data.name.toLowerCase()],
            eraId: data.eras?.[0] ?? 0,
          },
        ]),
      ),
    );
    const captured: UpsertMatchEvent[] = [];
    mocks.matchEventsImport.upsertMatchEvent.mockImplementation((data) => {
      captured.push(data);
      return Promise.resolve(true);
    });
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      new Map([
        [
          '46',
          [
            { bblId: PRIMARY, date: new Date(Date.UTC(2018, 8, 22)) },
            { bblId: SECONDARY, date: new Date(Date.UTC(2018, 8, 22)) },
          ],
        ],
      ]),
    );
    mocks.eventsReader.getMatchEventsByBblId.mockResolvedValue(
      new Map([
        [PRIMARY, eventsA],
        [SECONDARY, eventsB],
      ]),
    );
    mocks.matchMerge.resolve.mockResolvedValue({
      primaryBblIdByBblId: new Map([
        [PRIMARY, PRIMARY],
        [SECONDARY, PRIMARY],
      ]),
      partnerBblId: (bblId) =>
        bblId === PRIMARY
          ? SECONDARY
          : bblId === SECONDARY
            ? PRIMARY
            : undefined,
      isPrimary: (bblId) => bblId === PRIMARY,
      isSecondary: (bblId) => bblId === SECONDARY,
      effectivePlayedAt: (_bblId, rawDate) => rawDate,
    });

    await service.importMatchEvents({
      competitionsByBblId: new Map([
        [
          '46',
          {
            ...competition,
            externalIds: [
              { externalSystemId: BBL_SYSTEM_ID, externalId: '46' },
            ],
          },
        ],
      ]),
      teamsByCode,
      matchIdsByBblId: new Map([
        [PRIMARY, MATCH_DB_ID],
        [SECONDARY, MATCH_DB_ID],
      ]),
      playerIdsByPid: new Map([
        ['attacker', 900],
        ['victim1', 901],
        ['victim2', 902],
      ]),
    });

    // One serious_injury action + two candidate miss_next_game consequences =>
    // ambiguous, so NO merge: one action-only + two consequence-only events.
    const merged = captured.filter(
      (c) => c.actionType !== undefined && c.consequenceType !== undefined,
    );
    expect(merged).toHaveLength(0);
    expect(captured).toHaveLength(3);
  });

  it('emits a journeymen_signings event with the count and team, none for a zero side', async () => {
    const { captured } = await runImport(
      makeEvents({ journeymenCount: { home: 2, away: 0 } }),
    );

    const journeyman = captured.filter(
      (c) => c.actionType === 'journeymen_signings',
    );
    expect(journeyman).toHaveLength(1);
    expect(journeyman[0]).toEqual({
      matchId: MATCH_DB_ID,
      actionType: 'journeymen_signings',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      journeymenCount: 2,
      externalIds: [
        { externalSystemId: BBL_SYSTEM_ID, externalId: '89-hme-journeyman-0' },
      ],
    });
    expect(journeyman[0].actingPlayerId).toBeUndefined();
  });

  it('emits no journeymen_signings event when both counts are zero', async () => {
    const { captured } = await runImport(
      makeEvents({
        actions: [{ actionType: 'touchdown', side: 'home', pid: 'p1' }],
        journeymenCount: { home: 0, away: 0 },
      }),
      { p1: 1 },
    );

    expect(captured.some((c) => c.actionType === 'journeymen_signings')).toBe(
      false,
    );
  });
});
