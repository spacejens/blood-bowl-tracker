import { describe, expect, it } from 'vitest';

import type { EraConfig } from '../eras/era-config.service';
import { mockBblSourceReaderByType } from '../shared/bbl-source-reader-mock.test-helpers';
import {
  eraIdsByName,
  erasConfig,
  makeService,
  matchesByCompetition,
  page,
  resultArgs,
  upsertedCompetition,
} from './bbl-competitions-import.test-helpers';

describe('BblCompetitionsImportService overrides', () => {
  it("derives an overridden competition's dates from its matches, not from the configured override dates", async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '30', name: 'Chaos Cup' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '30': [new Date(Date.UTC(2013, 4, 4)), new Date(Date.UTC(2013, 4, 5))],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2013, 4, 4)),
      latestDate: new Date(Date.UTC(2013, 4, 5)),
      spanDays: 1,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(30),
    );
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        competitions: {
          overrides: [
            // startDate present but must be ignored: has real matches.
            { bblId: '30', type: 'cup', startDate: '1999-01-01' },
          ],
        },
      },
    ]);

    await service.importCompetitions();

    expect(resultArgs(mocks.importResults).errors).toHaveLength(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cup',
        eraId: 100,
        startDate: '2013-05-04',
        endDate: '2013-05-05',
      }),
      expect.any(Array),
    );
  });

  it("uses the override's own startDate/endDate for an overridden competition with no matches", async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '74', name: 'Minor Season 25' },
    ]);
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(74),
    );
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: {
          overrides: [
            {
              bblId: '74',
              type: 'season',
              startDate: '2023-07-01',
              endDate: '2023-12-31',
            },
          ],
        },
      },
    ]);

    await service.importCompetitions();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors).toHaveLength(0);
    expect(mocks.dateRange.computeRange).not.toHaveBeenCalled();
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      {
        name: 'Minor Season 25',
        type: 'season',
        eraId: 200,
        startDate: '2023-07-01',
        endDate: '2023-12-31',
        teamEraIds: [],
        externalIds: [{ externalSystemId: 1, externalId: '74' }],
      },
      expect.any(Array),
    );
  });

  it('omits endDate when the override has no endDate', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '74', name: 'Minor Season 25' },
    ]);
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(74),
    );
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: {
          overrides: [{ bblId: '74', type: 'season', startDate: '2023-07-01' }],
        },
      },
    ]);

    await service.importCompetitions();

    const upsertArg =
      mocks.competitionsImport.upsertCompetitionResult.mock.calls[0][0];
    expect(upsertArg.startDate).toBe('2023-07-01');
    expect(upsertArg.endDate).toBeUndefined();
  });

  it('skips an overridden competition with no matches and no configured startDate, recording an error', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '74', name: 'Minor Season 25' },
    ]);
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: { overrides: [{ bblId: '74', type: 'season' }] },
      },
    ]);

    await service.importCompetitions();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Minor Season 25');
    expect(errors[0].message).toContain('no startDate');
  });

  it('skips and records a distinct error when the override era could not be resolved', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
      new Map(),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '74', name: 'Minor Season 25' },
    ]);
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: { overrides: [{ bblId: '74', type: 'season' }] },
      },
    ]);
    // "BB2020" is matched by the competitions.overrides entry, but the
    // lookup resolves nothing, simulating its rules set having failed to
    // import earlier in the run.

    await service.importCompetitions();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(
      errors.some(
        (e) =>
          e.message.includes('"BB2020"') &&
          e.message.includes('could not be resolved'),
      ),
    ).toBe(true);
    expect(errors.some((e) => e.message.includes('no dated matches'))).toBe(
      false,
    );
  });

  it('imports a zero-match competition via its era override as type season', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '74', name: 'Minor Season 25' },
    ]);
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(74),
    );
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: {
          overrides: [
            {
              bblId: '74',
              type: 'season',
              startDate: '2023-07-01',
              endDate: '2023-12-31',
            },
          ],
        },
      },
    ]);

    const { competitionsByBblId, competitionIdsByBblId } =
      await service.importCompetitions();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors).toHaveLength(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      {
        name: 'Minor Season 25',
        type: 'season',
        eraId: 200,
        startDate: '2023-07-01',
        endDate: '2023-12-31',
        teamEraIds: [],
        externalIds: [{ externalSystemId: 1, externalId: '74' }],
      },
      expect.any(Array),
    );
    expect(competitionsByBblId.get('74')?.eraId).toBe(200);
    expect(competitionIdsByBblId.get('74')).toBe(74);
  });

  it('applies an era override ahead of match-date resolution even when the competition has matches', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '74', name: 'Minor Season 25' },
    ]);
    // Dates fall in the "Living rulebook" range and span 1 day (would be a
    // cup); the override must still pin BB2020 (era 200) and type season.
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '74': [new Date(Date.UTC(2012, 0, 1)), new Date(Date.UTC(2012, 0, 2))],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2012, 0, 1)),
      latestDate: new Date(Date.UTC(2012, 0, 2)),
      spanDays: 1,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(74),
    );
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
        competitions: { overrides: [{ bblId: '74', type: 'season' }] },
      },
    ]);

    await service.importCompetitions();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'season', eraId: 200 }),
      expect.any(Array),
    );
  });

  it('applies a competitions.overrides entry forcing type cup even when the span would compute season', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '33', name: 'Stunty Leeg 2' },
    ]);
    // 6-day span -> would compute 'season' under CUP_MAX_SPAN_DAYS; the cup
    // override must force 'cup' and pin the Living rulebook era (100).
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '33': [
          new Date(Date.UTC(2016, 10, 19)),
          new Date(Date.UTC(2016, 10, 25)),
        ],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2016, 10, 19)),
      latestDate: new Date(Date.UTC(2016, 10, 25)),
      spanDays: 6,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(33),
    );
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        competitions: { overrides: [{ bblId: '33', type: 'cup' }] },
      },
      {
        identity: { name: 'BB2020', rulesSets: ['BB2020'] },
        dates: { startDate: '2021-09-01', autoAssignByDate: true },
        players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
      },
    ]);

    await service.importCompetitions();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Stunty Leeg 2',
        type: 'cup',
        eraId: 100,
      }),
      expect.any(Array),
    );
  });

  it('resolves a competition override regardless of overlapping era date-range order', async () => {
    // Two eras whose date ranges overlap; the override era is listed SECOND but
    // must still win, proving override resolution is independent of array order
    // and of natural date-range matching.
    const overlapEraIds = new Map<string, number>([
      ['Living rulebook', 100],
      ['Stunty', 300],
    ]);
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
      overlapEraIds,
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '30', name: 'Stunty Leeg 1' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({ '30': [new Date(Date.UTC(2016, 2, 12))] }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2016, 2, 12)),
      latestDate: new Date(Date.UTC(2016, 2, 12)),
      spanDays: 0,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(30),
    );
    mocks.eraConfig.getEras.mockReturnValue([
      {
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
      {
        identity: { name: 'Stunty', rulesSets: ['Living rulebook'] },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
        competitions: { overrides: [{ bblId: '30', type: 'cup' }] },
      },
    ]);

    await service.importCompetitions();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Stunty Leeg 1',
        type: 'cup',
        eraId: 300,
      }),
      expect.any(Array),
    );
  });

  it('excludes an autoAssignByDate:false era from date resolution but still honors its competition override', async () => {
    // One override-only era (autoAssignByDate:false) whose date range would,
    // if scanned, capture the dated competition below — proving the scan skips
    // it. Its own override-listed competition still resolves to it.
    const overrideOnlyEras: EraConfig[] = [
      {
        identity: { name: 'Main', rulesSets: ['BB2020'] },
        dates: {
          startDate: '2016-01-01',
          endDate: '2017-01-01',
          autoAssignByDate: true,
        },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
      {
        identity: { name: 'Side', rulesSets: ['CRP'] },
        dates: {
          startDate: '2016-01-01',
          endDate: '2017-01-01',
          autoAssignByDate: false,
        },
        players: { autoAssignByPlayerId: false },
        competitions: { overrides: [{ bblId: '30', type: 'cup' }] },
      },
    ];
    const eraIds = new Map<string, number>([
      ['Main', 100],
      ['Side', 200],
    ]);
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
      eraIds,
    );
    mocks.eraConfig.getEras.mockReturnValue(overrideOnlyEras);
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Dated Season' },
      { bblId: '30', name: 'Side Cup' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '1': [new Date('2016-06-01'), new Date('2016-08-01')],
        '30': [new Date('2016-06-15')],
      }),
    );
    mocks.dateRange.computeRange
      .mockReturnValueOnce({
        earliestDate: new Date('2016-06-01'),
        latestDate: new Date('2016-08-01'),
        spanDays: 61,
      })
      .mockReturnValueOnce({
        earliestDate: new Date('2016-06-15'),
        latestDate: new Date('2016-06-15'),
        spanDays: 0,
      });
    mocks.competitionsImport.upsertCompetitionResult
      .mockResolvedValueOnce(upsertedCompetition(1))
      .mockResolvedValueOnce(upsertedCompetition(30));

    const { competitionsByBblId } = await service.importCompetitions();

    // The plain dated competition lands in Main (the only auto-assign era).
    expect(competitionsByBblId.get('1')?.eraId).toBe(100);
    // The override-listed competition lands in Side despite its date.
    expect(competitionsByBblId.get('30')?.eraId).toBe(200);
    expect(competitionsByBblId.get('30')?.type).toBe('cup');
  });

  it('resolves a competition to an override era from a second league', async () => {
    const erasWithGbbl: EraConfig[] = [
      ...erasConfig,
      {
        leagueName: 'GBBL',
        identity: { name: 'GBBL 1', rulesSets: ['BB2016'] },
        dates: {
          startDate: '2019-08-03',
          endDate: '2019-11-13',
          autoAssignByDate: false,
        },
        players: { autoAssignByPlayerId: false },
        competitions: { overrides: [{ bblId: '55', type: 'season' }] },
        teams: { teamCodeOverrides: ['fes2'] },
      },
    ];
    const eraIds = new Map<string, number>([...eraIdsByName, ['GBBL 1', 900]]);

    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '55' })] }),
      eraIds,
    );
    mocks.eraConfig.getEras.mockReturnValue(erasWithGbbl);
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '55', name: 'GBBL 1' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({ '55': [new Date('2019-08-03')] }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date('2019-08-03'),
      latestDate: new Date('2019-08-03'),
      spanDays: 0,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(1),
    );

    await service.importCompetitions();

    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ eraId: 900, type: 'season' }),
      expect.anything(),
    );
  });
});
