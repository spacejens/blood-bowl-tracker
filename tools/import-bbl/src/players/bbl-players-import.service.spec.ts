import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import { describe, expect, it } from 'vitest';

import { mockBblSourceReaderByType } from '../shared/bbl-source-reader-mock.test-helpers';
import {
  BBL_SYSTEM_ID,
  CANNED_PAGE_PARSE_ERROR,
  CANNED_RESULT,
  goodPlayer,
  importOptions,
  makeService,
  makeTeamRecord,
  plPage,
  resultArgs,
  team,
} from './bbl-players-import.test-helpers';
import type { BblPlayer } from './player-page-parser';

describe('BblPlayersImportService', () => {
  it('resolves configured eras and referenced positions through the api once for the whole run', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [] }),
    );

    await service.importPlayers(importOptions);

    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith('era', [
      { externalSystemId: BBL_SYSTEM_ID, externalId: 'LRB' },
    ]);
    // No player pages, so the batched position call still happens (one round
    // trip per run, regardless of whether it finds anything to resolve) but
    // with an empty ref list.
    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith('position', []);
    expect(mocks.lookup.lookupMap).toHaveBeenCalledTimes(2);
  });

  it('resolves positions by their typId-raceBblId external id', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );

    await service.importPlayers(importOptions);

    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith(
      'position',
      expect.arrayContaining([
        { externalSystemId: BBL_SYSTEM_ID, externalId: '33-7' },
      ]),
    );
  });

  it('imports a resolvable player and maps its pid to the DB id', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );

    const { playerIdsByPid, positionsUsedByEra } =
      await service.importPlayers(importOptions);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith(
      [{ name: 'BBL', category: 'imported_data_source' }],
      'Failed to upsert external system: ',
    );
    expect(playerIdsByPid.get('42')).toBe(900);
    expect(mocks.teamsImport.upsert).toHaveBeenCalledWith(
      { ...team, eras: [500] },
      expect.any(Array),
    );
    expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalledWith(
      {
        name: 'Griff Oberwald',
        teamEraId: 5000,
        positionId: 200,
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
        rulesSetId: 800,
        externalIds: [{ externalSystemId: 1, externalId: '42' }],
      },
      expect.any(Array),
    );
    // positionId 200, eraId 500 (from eraIdsByName), team.raceId 70.
    expect(positionsUsedByEra).toEqual(new Set(['200:500']));
  });

  it("returns each imported player's team era id keyed by pid", async () => {
    const { service } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );

    const { teamEraIdsByPid } = await service.importPlayers(importOptions);

    // Default makeService wiring resolves the team era to id 5000 (see
    // makeTeamRecord([{ id: 5000, eraId: 500 }]) in makeService).
    expect(teamEraIdsByPid.get('42')).toBe(5000);
  });

  it('omits the player from both playerIdsByPid and teamEraIdsByPid when the upserted team has no matching era', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );
    mocks.teamsImport.upsert.mockResolvedValue(
      makeTeamRecord([{ id: 5000, eraId: 999 }]),
    );

    const { playerIdsByPid, teamEraIdsByPid } =
      await service.importPlayers(importOptions);

    expect(playerIdsByPid.has('42')).toBe(false);
    expect(teamEraIdsByPid.has('42')).toBe(false);
  });

  it('resolves the era via playerIdOverrides when the pid is outside every range', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      [
        {
          identity: { name: 'Second', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 100,
            lastPlayerId: 9999,
            autoAssignByPlayerId: true,
          },
        },
        {
          identity: { name: 'LRB', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 10,
            autoAssignByPlayerId: true,
            playerIdOverrides: [42],
          },
        },
      ],
    );

    await service.importPlayers(importOptions);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.teamsImport.upsert).toHaveBeenCalledWith(
      { ...team, eras: [500] },
      expect.any(Array),
    );
    expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalled();
  });

  it('prefers a playerIdOverrides match over a range that would also match', async () => {
    const otherEraIdsByName = new Map<string, number>([
      ['LRB', 500],
      ['Second', 600],
    ]);
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      [
        {
          identity: { name: 'LRB', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 9999,
            autoAssignByPlayerId: true,
          },
        },
        {
          identity: { name: 'Second', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 9999,
            autoAssignByPlayerId: true,
            playerIdOverrides: [42],
          },
        },
      ],
      otherEraIdsByName,
    );
    mocks.teamsImport.upsert.mockResolvedValue(
      makeTeamRecord([{ id: 6000, eraId: 600 }]),
    );

    await service.importPlayers(importOptions);

    expect(mocks.teamsImport.upsert).toHaveBeenCalledWith(
      { ...team, eras: [600] },
      expect.any(Array),
    );
  });

  it('resolves the era via teamCodeOverrides ahead of the pid range, matching the team era', async () => {
    // goodPlayer has pid 42 and teamCode 'knu'. Its pid falls in "Regular"
    // (1..9999), but 'knu' is pinned to "Stunty" via teamCodeOverrides, which
    // must win — and the upserted team era must be the Stunty era (600), the
    // same era competition resolution would assign that team.
    const overrideEraIds = new Map<string, number>([
      ['Regular', 500],
      ['Stunty', 600],
    ]);
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      [
        {
          identity: { name: 'Regular', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 9999,
            autoAssignByPlayerId: true,
          },
        },
        {
          identity: { name: 'Stunty', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 9999,
            autoAssignByPlayerId: true,
          },
          teams: { teamCodeOverrides: ['knu'] },
        },
      ],
      overrideEraIds,
    );
    mocks.teamsImport.upsert.mockResolvedValue(
      makeTeamRecord([{ id: 6000, eraId: 600 }]),
    );

    await service.importPlayers(importOptions);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.teamsImport.upsert).toHaveBeenCalledWith(
      { ...team, eras: [600] },
      expect.any(Array),
    );
  });

  it('pins a player to a second-league era via its team-code override', async () => {
    // goodPlayer has pid 42 and teamCode 'knu'. Its pid falls within the
    // tLoEG era's pid range, but 'knu' is pinned to the GBBL era (a distinct
    // league) via teamCodeOverrides, which must win over the pid-range match
    // — proving overrides route correctly across league boundaries.
    const overrideEraIds = new Map<string, number>([
      ['LRB', 500],
      ['GBBL 1', 700],
    ]);
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      [
        {
          leagueName: 'tLoEG',
          identity: { name: 'LRB', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 9999,
            autoAssignByPlayerId: true,
          },
        },
        {
          leagueName: 'GBBL',
          identity: { name: 'GBBL 1', rulesSets: ['LRB'] },
          dates: {
            startDate: '2019-08-03',
            endDate: '2019-11-13',
            autoAssignByDate: false,
          },
          players: { autoAssignByPlayerId: false },
          teams: { teamCodeOverrides: ['knu'] },
        },
      ],
      overrideEraIds,
    );
    mocks.teamsImport.upsert.mockResolvedValue(
      makeTeamRecord([{ id: 7000, eraId: 700 }]),
    );

    await service.importPlayers(importOptions);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    // Pinned to the GBBL era's team era (eraId 700), not the tLoEG pid-range
    // era (500).
    expect(mocks.teamsImport.upsert).toHaveBeenCalledWith(
      { ...team, eras: [700] },
      expect.any(Array),
    );
  });

  it('prefers teamCodeOverrides over playerIdOverrides when the two disagree', async () => {
    // goodPlayer has pid 42 and teamCode 'knu'. Pid 42 is pinned to "Pid Era"
    // via playerIdOverrides, but 'knu' is separately pinned to "Team Era" via
    // teamCodeOverrides — teamCodeOverrides must win.
    const overrideEraIds = new Map<string, number>([
      ['Pid Era', 500],
      ['Team Era', 600],
    ]);
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      [
        {
          identity: { name: 'Pid Era', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 9999,
            autoAssignByPlayerId: true,
            playerIdOverrides: [42],
          },
        },
        {
          identity: { name: 'Team Era', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 9999,
            autoAssignByPlayerId: true,
          },
          teams: { teamCodeOverrides: ['knu'] },
        },
      ],
      overrideEraIds,
    );
    mocks.teamsImport.upsert.mockResolvedValue(
      makeTeamRecord([{ id: 6000, eraId: 600 }]),
    );

    await service.importPlayers(importOptions);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.teamsImport.upsert).toHaveBeenCalledWith(
      { ...team, eras: [600] },
      expect.any(Array),
    );
  });

  it('excludes an autoAssignByPlayerId:false era from the pid-range scan but still honors its teamCodeOverrides', async () => {
    // 'knu' (goodPlayer.teamCode) is pinned to the override-only Side era via
    // teamCodeOverrides. Side has no pid range and autoAssignByPlayerId:false,
    // so nothing else can land there; the pid 42 would otherwise match Main.
    const overrideEraIds = new Map<string, number>([
      ['Main', 400],
      ['Side', 500],
    ]);
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      [
        {
          identity: { name: 'Main', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 9999,
            autoAssignByPlayerId: true,
          },
        },
        {
          identity: { name: 'Side', rulesSets: ['LRB'] },
          dates: {
            startDate: '2016-03-12',
            endDate: '2016-11-26',
            autoAssignByDate: false,
          },
          players: { autoAssignByPlayerId: false },
          teams: { teamCodeOverrides: ['knu'] },
        },
      ],
      overrideEraIds,
    );
    mocks.teamsImport.upsert.mockResolvedValue(
      makeTeamRecord([{ id: 5000, eraId: 500 }]),
    );

    await service.importPlayers(importOptions);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    // Pinned to Side (eraId 500), not Main, via team code.
    expect(mocks.teamsImport.upsert).toHaveBeenCalledWith(
      { ...team, eras: [500] },
      expect.any(Array),
    );
  });

  it('skips an autoAssignByPlayerId:false era in the pid-range scan even when its range also matches', async () => {
    // Both "Disabled" and "Enabled" cover pid 42 via firstPlayerId/lastPlayerId,
    // and neither uses teamCodeOverrides or playerIdOverrides for this player,
    // so resolution must fall all the way through to the pid-range
    // `eras.find(...)` scan. "Disabled" is listed FIRST and would be picked if
    // the autoAssignByPlayerId guard were not applied; this proves the guard
    // itself causes eras.find to skip past it to "Enabled".
    const overrideEraIds = new Map<string, number>([
      ['Disabled', 400],
      ['Enabled', 500],
    ]);
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      [
        {
          identity: { name: 'Disabled', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 9999,
            autoAssignByPlayerId: false,
          },
        },
        {
          identity: { name: 'Enabled', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 9999,
            autoAssignByPlayerId: true,
          },
        },
      ],
      overrideEraIds,
    );
    mocks.teamsImport.upsert.mockResolvedValue(
      makeTeamRecord([{ id: 5000, eraId: 500 }]),
    );

    await service.importPlayers(importOptions);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    // Lands in "Enabled" (eraId 500), proving "Disabled" was genuinely
    // skipped by the range scan rather than merely checked-and-not-matching.
    expect(mocks.teamsImport.upsert).toHaveBeenCalledWith(
      { ...team, eras: [500] },
      expect.any(Array),
    );
  });

  it('resolves via playerIdOverrides even when the pinned era has autoAssignByPlayerId:false', async () => {
    // The playerIdOverrides lookup is built independently of the
    // autoAssignByPlayerId flag, so a pid pinned to a flagged-off era must
    // still resolve to it — the flag only affects the pid-range fallback.
    const overrideEraIds = new Map<string, number>([['Pinned', 500]]);
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      [
        {
          identity: { name: 'Pinned', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            autoAssignByPlayerId: false,
            playerIdOverrides: [42],
          },
        },
      ],
      overrideEraIds,
    );
    mocks.teamsImport.upsert.mockResolvedValue(
      makeTeamRecord([{ id: 5000, eraId: 500 }]),
    );

    await service.importPlayers(importOptions);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.teamsImport.upsert).toHaveBeenCalledWith(
      { ...team, eras: [500] },
      expect.any(Array),
    );
  });

  it('matches a pid >= firstPlayerId against an era with no lastPlayerId (still ongoing, no upper bound)', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      [
        {
          identity: { name: 'LRB', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        },
      ],
    );

    await service.importPlayers(importOptions);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalled();
  });

  it('skips and records an error when no era range contains the pid', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      [
        {
          identity: { name: 'LRB', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 10,
            autoAssignByPlayerId: true,
          },
        },
      ],
    );

    await service.importPlayers(importOptions);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(mocks.playersImport.upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('skips and records an error when the team code is unknown', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pl: [plPage({ ...goodPlayer, teamCode: 'zzz' })],
      }),
    );

    await service.importPlayers(importOptions);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(mocks.playersImport.upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('skips and records an error when no position matches the composite key', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pl: [plPage({ ...goodPlayer, typId: '99' })],
      }),
    );

    await service.importPlayers(importOptions);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it('records an error and returns early when external systems fail', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL'] },
        message: 'Failed to upsert external system: network timeout',
      },
    });

    const { playerIdsByPid } = await service.importPlayers(importOptions);

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    // Message is passed through with this caller's prefix: the assertion now
    // fails if production stops surfacing the real error text.
    expect(errors[0].message).toBe(
      'Failed to upsert external system: network timeout',
    );
    // Players bootstraps only the BBL external system (no Name system).
    expect(errors[0].item).toEqual({ externalSystems: ['BBL'] });
    expect(playerIdsByPid.size).toBe(0);
    expect(mocks.playersImport.upsertPlayerResult).not.toHaveBeenCalled();
    expect(mocks.lookup.lookupMap).not.toHaveBeenCalled();
  });

  it('records an error and skips players the parser cannot read', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(null, '388')] }),
    );

    await service.importPlayers(importOptions);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(mocks.playersImport.upsertPlayerResult).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('388');
    expect(errors[0]?.item).toEqual({ pid: '388' });
  });

  it('imports a player whose name is empty and maps its pid', async () => {
    const namelessPlayer: BblPlayer = {
      pid: '388',
      name: '',
      typId: '33',
      teamCode: 'knu',
      sppTotal: null,
      characteristics: {
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
      },
    };
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(namelessPlayer)] }),
    );

    const { playerIdsByPid } = await service.importPlayers(importOptions);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(playerIdsByPid.get('388')).toBe(900);
    expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalledWith(
      {
        name: '',
        teamEraId: 5000,
        positionId: 200,
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
        rulesSetId: 800,
        externalIds: [{ externalSystemId: 1, externalId: '388' }],
      },
      expect.any(Array),
    );
  });

  it('skips and records an error when the pid-matched era was not imported', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      [
        {
          identity: { name: 'Unimported Era', rulesSets: ['LRB'] },
          dates: { startDate: '2011-09-09', autoAssignByDate: true },
          players: {
            firstPlayerId: 1,
            lastPlayerId: 9999,
            autoAssignByPlayerId: true,
          },
        },
      ],
    );

    await service.importPlayers(importOptions);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(mocks.teamsImport.upsert).not.toHaveBeenCalled();
    expect(mocks.playersImport.upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('skips without recording its own error when the team upsert fails', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );
    mocks.teamsImport.upsert.mockResolvedValue(undefined);

    await service.importPlayers(importOptions);

    expect(resultArgs(mocks.importResults).imported).toBe(0);
    expect(mocks.playersImport.upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('skips and records an error when the upserted team has no matching era', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );
    mocks.teamsImport.upsert.mockResolvedValue(
      makeTeamRecord([{ id: 5000, eraId: 999 }]),
    );

    await service.importPlayers(importOptions);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(mocks.playersImport.upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('skips and records an error when the team race has no BBL id mapping', async () => {
    const unmappedRaceTeam: UpsertTeam = { ...team, raceId: 999 };
    const localTeamsByCode = new Map<string, UpsertTeam>([
      ['knu', unmappedRaceTeam],
    ]);
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );

    await service.importPlayers({
      ...importOptions,
      teamsByCode: localTeamsByCode,
    });

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('33-?');
    expect(mocks.playersImport.upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('records a page-parse error via the main loop for a team whose race id cannot be resolved, without aborting the run for other pages', async () => {
    // Regression test for bfa7bc34: the pre-pass loop that collects position
    // refs now wraps its resolveDefiniteRaceId call in try/catch and silently
    // skips a bad team (`continue`), rather than letting the throw abort the
    // whole importPlayers run before any ImportResult is produced. The main
    // loop below re-processes the same page inside its own try/catch, which
    // is what actually records the error via pageParseError.build. This test
    // proves both: the run completes (doesn't reject) and still imports a
    // player from another page, and the bad page's error is recorded exactly
    // once by the main loop, not the pre-pass.
    const badTeam: UpsertTeam = {
      name: 'Bad Team',
      raceId: 999,
      coachId: 9,
      eras: [],
      externalIds: [],
    };
    const localTeamsByCode = new Map<string, UpsertTeam>([
      ['knu', team],
      ['bad', badTeam],
    ]);
    const badPlayer: BblPlayer = {
      pid: '77',
      name: 'Bad Player',
      typId: '33',
      teamCode: 'bad',
      sppTotal: null,
      characteristics: {
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
      },
    };
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pl: [plPage(badPlayer, '77'), plPage(goodPlayer, '42')],
      }),
    );
    mocks.upsertFieldNarrowing.resolveDefiniteRaceId.mockImplementation((t) => {
      if (t === badTeam) {
        throw new Error('no resolvable race id');
      }
      return t.raceId as number;
    });

    const { result, playerIdsByPid } = await service.importPlayers({
      ...importOptions,
      teamsByCode: localTeamsByCode,
    });

    // The run resolves rather than rejecting, and still returns the mocked
    // result unchanged.
    expect(result).toBe(CANNED_RESULT);
    const { imported, errors } = resultArgs(mocks.importResults);
    // Exactly one error: the pre-pass's catch is silent (no push), so only
    // the main loop's catch records it.
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledTimes(1);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { player: JSON.stringify(badPlayer), pid: '77' },
      'player',
      expect.any(Error),
    );
    // The bad page is skipped, but the run continues and still imports the
    // player from the other page.
    expect(imported).toBe(1);
    expect(playerIdsByPid.has('77')).toBe(false);
    expect(playerIdsByPid.get('42')).toBe(900);
  });

  it('does not count or map the player when the upsert reports failure', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );
    mocks.playersImport.upsertPlayerResult.mockResolvedValue(undefined);

    const { playerIdsByPid } = await service.importPlayers(importOptions);

    expect(resultArgs(mocks.importResults).imported).toBe(0);
    expect(playerIdsByPid.size).toBe(0);
    expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalled();
  });

  it('contributes no usage keys for a skipped or errored player', async () => {
    const { service } = await makeService(
      mockBblSourceReaderByType({
        pl: [plPage({ ...goodPlayer, teamCode: 'zzz' })],
      }),
    );

    const { positionsUsedByEra } = await service.importPlayers(importOptions);

    expect(positionsUsedByEra.size).toBe(0);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );

    const { result } = await service.importPlayers(importOptions);

    expect(result).toBe(CANNED_RESULT);
  });

  it('returns each upserted player’s scraped career SPP total', async () => {
    const playerWithTotal: BblPlayer = {
      ...goodPlayer,
      pid: '42',
      sppTotal: 16,
    };
    const playerWithoutTotal: BblPlayer = {
      ...goodPlayer,
      pid: '43',
      sppTotal: null,
    };
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pl: [plPage(playerWithTotal, '42'), plPage(playerWithoutTotal, '43')],
      }),
    );
    mocks.playersImport.upsertPlayerResult
      .mockResolvedValueOnce({ id: 101 })
      .mockResolvedValueOnce({ id: 102 });

    const outcome = await service.importPlayers(importOptions);

    expect(outcome.scrapedSppTotalsByPlayerId).toEqual(
      new Map([
        [101, 16],
        [102, null],
      ]),
    );
  });

  it('omits a player whose upsert failed from the scraped totals', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );
    mocks.playersImport.upsertPlayerResult.mockResolvedValue(undefined);

    const outcome = await service.importPlayers(importOptions);

    expect(outcome.scrapedSppTotalsByPlayerId).toEqual(new Map());
  });
});
