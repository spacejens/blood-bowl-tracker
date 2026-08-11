import { describe, expect, it } from 'vitest';

import {
  AWAY_TEAM_ERA_ID,
  awayTeam,
  BBL_SYSTEM_ID,
  CANNED_RESULT,
  competition,
  externalIds,
  HOME_TEAM_ERA_ID,
  homeTeam,
  makeEvents,
  makeService,
  MATCH_BBL_ID,
  MATCH_DB_ID,
  runImport,
} from './bbl-match-events-import.test-helpers';

describe('BblMatchEventsImportService', () => {
  it('scenario 1: a home hattrick yields td-0, td-1, td-2 occurrence ids', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      { p1: 11, p2: 12, p3: 13 },
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p1',
          },
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p2',
          },
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p3',
          },
        ],
      },
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

  it('scenario 2: a merged action+consequence event maps both sides to their team eras and players', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      { killer: 7, victim: 8 },
      {
        correlatedEvents: [
          {
            actionType: 'death',
            consequenceType: 'death',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'killer',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: 'victim',
          },
        ],
      },
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
        { externalSystemId: BBL_SYSTEM_ID, externalId: '89-awy-death-0' },
      ],
      computeSppValue: true,
    });
  });

  it('scenario 3: independent action-only and consequence-only events each get their own per-team-and-category counter', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      { a1: 1, a2: 2, v1: 3 },
      {
        correlatedEvents: [
          {
            actionType: 'serious_injury',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'a1',
          },
          {
            actionType: 'serious_injury',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'a2',
          },
          {
            consequenceType: 'miss_next_game',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: 'v1',
          },
        ],
      },
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

  it('scenario 4: an action-only event maps its team and player, with no consequence fields', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      { f1: 5 },
      {
        correlatedEvents: [
          {
            actionType: 'foul',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'f1',
          },
        ],
      },
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
      computeSppValue: true,
    });
  });

  it('scenario 5: a consequence-only event with a null pid still gets an external id and no player id', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      {},
      {
        correlatedEvents: [
          {
            consequenceType: 'death',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: null,
          },
        ],
      },
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      matchId: MATCH_DB_ID,
      consequenceType: 'death',
      consequenceTeamEraId: AWAY_TEAM_ERA_ID,
      externalIds: [
        { externalSystemId: BBL_SYSTEM_ID, externalId: '89-awy-death-0' },
      ],
      computeSppValue: true,
    });
    expect(captured[0].consequencePlayerId).toBeUndefined();
  });

  it('scenario 6: asks the server to compute an spp value for every emitted event', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      { p1: 7 },
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p1',
          },
          {
            actionType: 'foul',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p1',
          },
        ],
      },
    );

    expect(captured).toHaveLength(2);
    for (const event of captured) {
      expect(event.computeSppValue).toBe(true);
    }
  });

  it('records a non-fatal error but still emits the event when a pid has no imported id', async () => {
    const { captured, resultArgs } = await runImport(
      makeEvents({}),
      {},
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'ghost',
          },
        ],
      },
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].actingPlayerId).toBeUndefined();
    expect(captured[0].externalIds[0].externalId).toBe('89-hme-td-0');
    expect(resultArgs.errors.length).toBeGreaterThan(0);
  });

  it('counts each emitted event as imported', async () => {
    const { resultArgs } = await runImport(
      makeEvents({}),
      { p1: 1, p2: 2 },
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p1',
          },
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p2',
          },
        ],
      },
    );

    expect(resultArgs.imported).toBe(2);
    expect(resultArgs.errors).toEqual([]);
  });

  it('records an error and skips a match with no imported id', async () => {
    const { captured, resultArgs, mocks } = await runImport(
      makeEvents({}),
      { p1: 1 },
      { matchIdsByBblId: new Map() },
    );

    expect(captured).toHaveLength(0);
    expect(mocks.matchEventsImport.addToBatch).not.toHaveBeenCalled();
    expect(resultArgs.errors).toHaveLength(1);
    expect(resultArgs.errors[0].message).toContain('no imported match id');
    // The match is skipped before correlation is even consulted.
    expect(mocks.correlation.combineOccurrences).not.toHaveBeenCalled();
  });

  it('records an error and skips a match whose team code does not resolve', async () => {
    const { captured, resultArgs, mocks } = await runImport(
      makeEvents({}),
      { p1: 1 },
      { teamsByCode: new Map([['hme', homeTeam]]) },
    );

    expect(captured).toHaveLength(0);
    expect(mocks.matchEventsImport.addToBatch).not.toHaveBeenCalled();
    expect(
      resultArgs.errors.some((e) =>
        e.message.includes('could not resolve all'),
      ),
    ).toBe(true);
    expect(resultArgs.errors.some((e) => e.message.includes('"awy"'))).toBe(
      true,
    );
    // The unresolved team short-circuits before events are correlated.
    expect(mocks.correlation.correlateEvents).not.toHaveBeenCalled();
  });

  it('opens one batch for the run and flushes the trailing chunk once', async () => {
    const { resultArgs, mocks } = await runImport(
      makeEvents({}),
      { p1: 11, p2: 12, p3: 13 },
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p1',
          },
        ],
      },
    );

    expect(mocks.matchEventsImport.createBatch).toHaveBeenCalledTimes(1);
    expect(mocks.matchEventsImport.flushBatch).toHaveBeenCalledTimes(1);
    expect(mocks.matchEventsImport.flushBatch).toHaveBeenCalledWith(
      mocks.matchEventsImport.createBatch.mock.results[0].value,
    );
    expect(resultArgs.imported).toBeGreaterThan(0);
  });

  it('records an error and skips a match when a team upsert resolves to no era', async () => {
    const { captured, resultArgs } = await runImport(
      makeEvents({}),
      { p1: 1 },
      { upsertTeam: () => Promise.resolve(undefined) },
    );

    expect(captured).toHaveLength(0);
    expect(
      resultArgs.errors.some((e) =>
        e.message.includes('could not resolve all'),
      ),
    ).toBe(true);
  });

  it('emits a journeymen_signings event with the count and team, and no player id for its null pid', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      {},
      {
        correlatedEvents: [
          {
            actionType: 'journeymen_signings',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: null,
            journeymenCount: 2,
          },
        ],
      },
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
      computeSppValue: true,
    });
    expect(journeyman[0].actingPlayerId).toBeUndefined();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service, mocks } = await makeService();
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      new Map([['3', [{ bblId: MATCH_BBL_ID, date: new Date(0) }]]]),
    );
    mocks.eventsReader.getMatchEventsByBblId.mockResolvedValue(
      new Map([[MATCH_BBL_ID, makeEvents({})]]),
    );

    const { result } = await service.importMatchEvents({
      competitionsByBblId: new Map([['3', competition]]),
      teamsByCode: new Map([
        ['hme', homeTeam],
        ['awy', awayTeam],
      ]),
      matchIdsByBblId: new Map([[MATCH_BBL_ID, MATCH_DB_ID]]),
      playerIdsByPid: new Map(),
    });

    expect(result).toBe(CANNED_RESULT);
  });

  it('writes the unidentified kinds and avoided-casualty fields onto the upsert', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      {},
      {
        correlatedEvents: [
          {
            actionType: 'death',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: null,
            actingUnidentifiedKind: 'mercenary_or_star',
          },
          {
            consequenceType: 'casualty_avoided',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: null,
            consequenceUnidentifiedKind: 'journeyman',
            consequenceAvoidedBy: 'apothecary',
            consequenceAvoidedSeverity: 'death',
          },
        ],
      },
    );

    expect(captured[0]).toMatchObject({
      actionType: 'death',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      actingUnidentifiedKind: 'mercenary_or_star',
    });
    expect(captured[1]).toMatchObject({
      consequenceType: 'casualty_avoided',
      consequenceTeamEraId: AWAY_TEAM_ERA_ID,
      consequenceUnidentifiedKind: 'journeyman',
      consequenceAvoidedBy: 'apothecary',
      consequenceAvoidedSeverity: 'death',
    });
    expect(externalIds(captured)[1]).toBe('89-awy-cas-avoided-0');
  });

  it('emits an external id from each side of a merged avoided casualty', async () => {
    // A merged event carries both actionType and consequenceType, and each
    // side has its own occurrence identity (team, category, index). Both are
    // persisted, action side first, so a re-import whose correlation decision
    // changes can still reconcile the row from either side.
    const { captured } = await runImport(
      makeEvents({}),
      { killer: 11 },
      {
        correlatedEvents: [
          {
            actionType: 'death',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'killer',
            consequenceType: 'casualty_avoided',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: null,
            consequenceAvoidedBy: 'regeneration',
            consequenceAvoidedSeverity: 'death',
          },
        ],
      },
    );

    expect(captured[0]).toMatchObject({
      actionType: 'death',
      consequenceType: 'casualty_avoided',
      consequenceAvoidedBy: 'regeneration',
      consequenceAvoidedSeverity: 'death',
    });
    expect(captured[0].externalIds).toEqual([
      { externalSystemId: BBL_SYSTEM_ID, externalId: '89-hme-death-0' },
      { externalSystemId: BBL_SYSTEM_ID, externalId: '89-awy-cas-avoided-0' },
    ]);
  });

  it('shares one occurrence counter per team and category across merged and non-merged sides', async () => {
    // The merged event's two sides and the two standalone occurrences all
    // draw from the same `${teamCode}-${category}` counters, in emission
    // order, so indices neither collide nor skip.
    const { captured } = await runImport(
      makeEvents({}),
      {},
      {
        correlatedEvents: [
          {
            actionType: 'casualty',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: null,
            consequenceType: 'casualty',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: null,
          },
          {
            actionType: 'casualty',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: null,
          },
          {
            consequenceType: 'casualty',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: null,
          },
        ],
      },
    );

    expect(captured[0].externalIds).toEqual([
      { externalSystemId: BBL_SYSTEM_ID, externalId: '89-hme-cas-0' },
      { externalSystemId: BBL_SYSTEM_ID, externalId: '89-awy-cas-0' },
    ]);
    // Action-only: exactly one id, from the next index of the shared counter.
    expect(captured[1].externalIds).toEqual([
      { externalSystemId: BBL_SYSTEM_ID, externalId: '89-hme-cas-1' },
    ]);
    // Consequence-only: exactly one id, likewise.
    expect(captured[2].externalIds).toEqual([
      { externalSystemId: BBL_SYSTEM_ID, externalId: '89-awy-cas-1' },
    ]);
  });

  it('omits the unidentified-kind and avoided-casualty fields entirely when the emitted event carries no tags', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      { p1: 11 },
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p1',
          },
        ],
      },
    );

    expect(captured[0]).not.toHaveProperty('actingUnidentifiedKind');
    expect(captured[0]).not.toHaveProperty('consequenceUnidentifiedKind');
    expect(captured[0]).not.toHaveProperty('consequenceAvoidedBy');
    expect(captured[0]).not.toHaveProperty('consequenceAvoidedSeverity');
  });

  it('reports each parser annotation error as a non-fatal import error', async () => {
    const { resultArgs } = await runImport(
      makeEvents({
        annotationErrors: [
          {
            label: 'Killers',
            side: 'home',
            text: 'victim eaten by the crowd',
            reason: 'unrecognised',
          },
          {
            label: 'Death',
            side: 'away',
            text: 'foul',
            reason: 'misplaced',
          },
        ],
      }),
    );

    expect(resultArgs.errors).toHaveLength(2);
    expect(resultArgs.errors[0].message).toContain('victim eaten by the crowd');
    expect(resultArgs.errors[0].message).toContain('Killers');
    expect(resultArgs.errors[0].message).toContain(
      'the text is not a known annotation',
    );
    expect(resultArgs.errors[1].message).toContain(
      'the annotation cannot apply to this kind of row',
    );
  });

  it('still imports a match whose cells also contain an unusable annotation', async () => {
    const { captured, resultArgs } = await runImport(
      makeEvents({
        annotationErrors: [
          { label: 'Death', side: 'away', text: 'foul', reason: 'misplaced' },
        ],
      }),
      { p1: 11 },
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p1',
          },
        ],
      },
    );

    expect(captured).toHaveLength(1);
    expect(resultArgs.imported).toBe(1);
  });

  it('records no annotation errors for a page that parsed cleanly', async () => {
    const { resultArgs } = await runImport(makeEvents({}));

    expect(resultArgs.errors).toEqual([]);
  });
});
