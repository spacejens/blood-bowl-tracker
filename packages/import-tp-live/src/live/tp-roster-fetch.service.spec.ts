import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpRosterPathsService } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { TpConnectionProvider } from '../tp-import-providers';
import { TP_CONNECTION_PROVIDER } from '../tp-import-providers';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpRosterFetchService } from './tp-roster-fetch.service';

const BACKEND = 'https://tp.example/api/';
const FRONTEND = 'https://tp.example/blood-bowl/';

const ROSTER: TpRoster = {
  id: 163386,
  teamName: 'Da Boyz',
  teamRaceCode: 'Orc',
  raceName: 'Orc',
  coachTpId: 'guid-c',
  coachName: 'Coach C',
  positions: [],
  starPositions: [],
  players: [],
};

describe('TpRosterFetchService', () => {
  let service: TpRosterFetchService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let parser: MockProxy<RosterParserService>;
  let errors: ImportError[];

  beforeEach(async () => {
    const connection = mock<TpConnectionProvider>();
    connection.getBackendApiUrl.mockReturnValue(BACKEND);
    connection.getFrontendUrl.mockReturnValue(FRONTEND);
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    parser = mock<RosterParserService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRosterFetchService,
        { provide: TP_CONNECTION_PROVIDER, useValue: connection },
        { provide: TpFetcherService, useValue: fetcher },
        // Pure, dependency-free path formatting, passed real so these tests
        // assert on the actual URLs requested.
        TpRosterPathsService,
        { provide: RosterParserService, useValue: parser },
        // Constructor-free and pure, per Global Constraints, so tests pass
        // it real and assert on the actual recorded error objects.
        TpImportResultsService,
      ],
    }).compile();
    service = moduleRef.get(TpRosterFetchService);
  });

  it('fetches the roster from the API with its page as referer and returns it parsed', async () => {
    const body = { raw: true };
    session.fetch.mockResolvedValue(body);
    parser.parse.mockReturnValue(ROSTER);

    const roster = await service.fetchRoster({ rosterId: 163386, errors });

    expect(roster).toBe(ROSTER);
    expect(session.fetch).toHaveBeenCalledWith(
      'https://tp.example/api/rosters/163386',
      { referer: 'https://tp.example/blood-bowl/roster/163386' },
    );
    expect(parser.parse).toHaveBeenCalledWith(body);
    expect(errors).toEqual([]);
  });

  it('fetches through the given session instead of starting one', async () => {
    const given = mock<TpFetchSession>();
    given.fetch.mockResolvedValue({});
    parser.parse.mockReturnValue(ROSTER);

    await service.fetchRoster({ rosterId: 163386, errors, session: given });

    expect(given.fetch).toHaveBeenCalledTimes(1);
    expect(fetcher.createSession).not.toHaveBeenCalled();
  });

  it('records one error naming the roster and returns undefined when the fetch fails', async () => {
    session.fetch.mockRejectedValue(new Error('status 403'));

    const roster = await service.fetchRoster({ rosterId: 163386, errors });

    expect(roster).toBeUndefined();
    expect(errors).toEqual([
      {
        item: { rosterId: 163386 },
        message: 'Could not fetch TP roster 163386: status 403',
      },
    ]);
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error fetch failure', async () => {
    session.fetch.mockRejectedValue('boom');

    await service.fetchRoster({ rosterId: 1, errors });

    expect(errors[0].message).toBe('Could not fetch TP roster 1: boom');
  });

  it('records one error and returns undefined when the response does not parse', async () => {
    session.fetch.mockResolvedValue({});
    parser.parse.mockImplementation(() => {
      throw new Error('teamName: Required');
    });

    const roster = await service.fetchRoster({ rosterId: 163386, errors });

    expect(roster).toBeUndefined();
    expect(errors).toEqual([
      {
        item: { rosterId: 163386 },
        message: 'Could not parse TP roster 163386: teamName: Required',
      },
    ]);
  });

  it('stringifies a non-Error parse failure', async () => {
    session.fetch.mockResolvedValue({});
    parser.parse.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad shape';
    });

    await service.fetchRoster({ rosterId: 1, errors });

    expect(errors[0].message).toBe('Could not parse TP roster 1: bad shape');
  });
});
