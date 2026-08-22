import { describe, expect, it } from 'vitest';

import { mockBblSourceReaderByType } from '../shared/bbl-source-reader-mock.test-helpers';
import {
  BBL_SYSTEM_ID,
  CANNED_PAGE_PARSE_ERROR,
  CANNED_RESULT,
  makeService,
  matchesByCompetition,
  page,
  resultArgs,
  upsertedCompetition,
} from './bbl-competitions-import.test-helpers';

describe('BblCompetitionsImportService', () => {
  it('resolves configured eras through the api once for the whole run', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([]);

    await service.importCompetitions();

    expect(mocks.lookup.lookupMap).toHaveBeenCalledTimes(1);
    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith('era', [
      { externalSystemId: BBL_SYSTEM_ID, externalId: 'Living rulebook' },
      { externalSystemId: BBL_SYSTEM_ID, externalId: 'BB2020' },
    ]);
  });

  it('populates startDate and endDate from the match-date range', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Major Season 1' },
    ]);
    const dates = [
      new Date(Date.UTC(2011, 11, 7)),
      new Date(Date.UTC(2011, 11, 18)),
    ];
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({ '1': dates }),
    );
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(42),
    );

    await service.importCompetitions();

    expect(mocks.dateRange.computeRange).toHaveBeenCalledWith(dates);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2011-12-07',
        endDate: '2011-12-18',
      }),
      expect.any(Array),
    );
  });

  it('derives type=season from a >3-day span and resolves the containing era', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Major Season 1' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '1': [
          new Date(Date.UTC(2011, 11, 7)),
          new Date(Date.UTC(2011, 11, 18)),
        ],
      }),
    );
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(42),
    );

    const { competitionsByBblId } = await service.importCompetitions();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
    ]);
    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      {
        name: 'Major Season 1',
        type: 'season',
        eraId: 100,
        startDate: '2011-12-07',
        endDate: '2011-12-18',
        teamEraIds: [],
        externalIds: [{ externalSystemId: 1, externalId: '1' }],
      },
      expect.any(Array),
    );
    expect(competitionsByBblId.get('1')).toEqual({
      name: 'Major Season 1',
      type: 'season',
      eraId: 100,
      startDate: '2011-12-07',
      endDate: '2011-12-18',
      teamEraIds: [],
      externalIds: [{ externalSystemId: 1, externalId: '1' }],
    });
  });

  it('reports each imported competition curated group and created flag', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Major Season 1' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '1': [
          new Date(Date.UTC(2011, 11, 7)),
          new Date(Date.UTC(2011, 11, 18)),
        ],
      }),
    );
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue({
      ...upsertedCompetition(42),
      competitionGroupId: 5,
      created: false,
    });

    const { competitionsByBblId, competitionEntriesByBblId } =
      await service.importCompetitions();

    expect(competitionEntriesByBblId.get('1')).toEqual({
      upsert: competitionsByBblId.get('1'),
      competitionGroupId: 5,
      created: false,
    });
  });

  it('reports no competition entry for a competition that failed to upsert', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Major Season 1' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '1': [
          new Date(Date.UTC(2011, 11, 7)),
          new Date(Date.UTC(2011, 11, 18)),
        ],
      }),
    );
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      undefined,
    );

    const { competitionEntriesByBblId } = await service.importCompetitions();

    expect(competitionEntriesByBblId.size).toBe(0);
  });

  it('derives type=cup from a <=3-day span', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '5', name: 'Chaos Cup' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '5': [new Date(Date.UTC(2021, 9, 2)), new Date(Date.UTC(2021, 9, 4))],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2021, 9, 2)),
      latestDate: new Date(Date.UTC(2021, 9, 4)),
      spanDays: 2,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(7),
    );

    await service.importCompetitions();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chaos Cup', type: 'cup', eraId: 200 }),
      expect.any(Array),
    );
  });

  it('skips and records an error for a competition with no dated matches', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '9', name: 'In Progress' },
    ]);

    await service.importCompetitions();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(errors.some((e) => e.message.includes('no dated matches'))).toBe(
      true,
    );
  });

  it('skips and records an error when no configured era contains the earliest match date', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '3', name: 'Ancient Season' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '3': [new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2000, 5, 1))],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2000, 0, 1)),
      latestDate: new Date(Date.UTC(2000, 5, 1)),
      spanDays: 152,
    });

    await service.importCompetitions();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(errors.some((e) => e.message.includes('no configured era'))).toBe(
      true,
    );
  });

  it('skips and records a distinct error when the matched era could not be resolved', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
      new Map(),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Major Season 1' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '1': [
          new Date(Date.UTC(2011, 11, 7)),
          new Date(Date.UTC(2011, 11, 18)),
        ],
      }),
    );
    // "Living rulebook" matches by date, but the lookup resolves nothing,
    // simulating its rules set having failed to import earlier in the run.

    await service.importCompetitions();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(
      errors.some(
        (e) =>
          e.message.includes('"Living rulebook"') &&
          e.message.includes('could not be resolved'),
      ),
    ).toBe(true);
    expect(errors.some((e) => e.message.includes('no configured era'))).toBe(
      false,
    );
  });

  it('falls back to an sr page for the master list when no se page exists', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [], sr: [page('sr', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Major Season 1' },
    ]);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '1': [new Date(Date.UTC(2012, 0, 1)), new Date(Date.UTC(2012, 5, 1))],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2012, 0, 1)),
      latestDate: new Date(Date.UTC(2012, 5, 1)),
      spanDays: 152,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(1),
    );

    await service.importCompetitions();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.competitionsImport.upsertCompetitionResult).toHaveBeenCalled();
  });

  it('skips a bare se index page (no s param) and reads the list from the page that has one', async () => {
    // Mirrors the real BBL mirror's bare `default.asp?p=se` index page, which
    // has no `s` param and lacks the master `<option>` dropdown entirely, so
    // extractCompetitions correctly (but unhelpfully) returns [] for it.
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        se: [page('se', {}), page('se', { s: '66' })],
      }),
    );
    mocks.listParser.extractCompetitions.mockImplementation((p) =>
      p.params.s === undefined ? [] : [{ bblId: '1', name: 'Major Season 1' }],
    );
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      matchesByCompetition({
        '1': [new Date(Date.UTC(2012, 0, 1)), new Date(Date.UTC(2012, 5, 1))],
      }),
    );
    mocks.dateRange.computeRange.mockReturnValue({
      earliestDate: new Date(Date.UTC(2012, 0, 1)),
      latestDate: new Date(Date.UTC(2012, 5, 1)),
      spanDays: 152,
    });
    mocks.competitionsImport.upsertCompetitionResult.mockResolvedValue(
      upsertedCompetition(1),
    );

    await service.importCompetitions();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.competitionsImport.upsertCompetitionResult).toHaveBeenCalled();
  });

  it('records one error and imports nothing when external system bootstrap fails', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([
      { bblId: '1', name: 'Major Season 1' },
    ]);
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL'] },
        message: 'network timeout',
      },
    });

    await service.importCompetitions();

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(errors[0].item).toEqual({
      externalSystems: ['BBL'],
    });
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
  });

  it('records one error naming only the BBL system when the era config cannot be read', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.eraConfig.getEras.mockImplementation(() => {
      throw new Error('era config is malformed');
    });

    const { competitionsByBblId } = await service.importCompetitions();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('era config is malformed');
    expect(errors[0].item).toEqual({ externalSystems: ['BBL'] });
    expect(mocks.bootstrap.bootstrap).not.toHaveBeenCalled();
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(competitionsByBblId.size).toBe(0);
  });

  it('records an error and reports zero imports when the master list page fails to parse', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockImplementation(() => {
      throw new Error('bad se page');
    });

    await service.importCompetitions();

    // readCompetitionList returns null on a parse failure, and the caller
    // treats a null result the same as "no se or sr page was found" — so a
    // parse failure records *two* errors: the page-parse error itself, and
    // the caller's fallback "no se or sr page" error.
    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(
      mocks.competitionsImport.upsertCompetitionResult,
    ).not.toHaveBeenCalled();
    expect(errors).toContainEqual(CANNED_PAGE_PARSE_ERROR);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { s: '66' },
      'master competition list',
      new Error('bad se page'),
    );
    expect(errors.some((e) => e.message.includes('no se or sr page'))).toBe(
      true,
    );
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ se: [page('se', { s: '66' })] }),
    );
    mocks.listParser.extractCompetitions.mockReturnValue([]);

    const { result } = await service.importCompetitions();

    expect(result).toBe(CANNED_RESULT);
  });
});
