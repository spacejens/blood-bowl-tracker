import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { ImportResultService } from '@blood-bowl-tracker/import-shared';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpBlockedError } from '@blood-bowl-tracker/scrape-tp';
import type { TpBaseUrls } from '@blood-bowl-tracker/tp-paths';
import { TpRosterPathsService } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpRequestFetchService } from './tp-request-fetch.service';
import { TpRosterFetchService } from './tp-roster-fetch.service';

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
  let requestFetch: MockProxy<TpRequestFetchService>;
  let parser: MockProxy<RosterParserService>;
  let errors: ImportError[];

  beforeEach(async () => {
    requestFetch = mock<TpRequestFetchService>();
    const baseUrls = mock<TpBaseUrls>();
    baseUrls.getBackendApiUrl.mockReturnValue('https://tp.example/api/');
    baseUrls.getFrontendBaseUrl.mockReturnValue(
      'https://tp.example/blood-bowl/',
    );
    requestFetch.baseUrls.mockReturnValue(baseUrls);
    parser = mock<RosterParserService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRosterFetchService,
        { provide: TpRequestFetchService, useValue: requestFetch },
        // Pure, dependency-free path formatting, passed real so these tests
        // assert on the actual URLs requested.
        TpRosterPathsService,
        { provide: RosterParserService, useValue: parser },
        // Constructor-free and pure, per Global Constraints, so tests pass
        // it real and assert on the actual recorded error objects.
        ImportResultService,
      ],
    }).compile();
    service = moduleRef.get(TpRosterFetchService);
  });

  it('requests the roster with its page as referer and returns it parsed alongside its raw JSON', async () => {
    const body = { raw: true };
    requestFetch.fetch.mockResolvedValue({ content: body });
    parser.parse.mockReturnValue(ROSTER);

    const fetched = await service.fetchRoster({ rosterId: 163386, errors });

    expect(fetched).toEqual({ roster: ROSTER, content: body });
    expect(fetched?.roster).toBe(ROSTER);
    expect(fetched?.content).toBe(body);
    expect(requestFetch.fetch).toHaveBeenCalledWith({
      request: {
        path: 'rosters/163386',
        url: 'https://tp.example/api/rosters/163386',
        referer: 'https://tp.example/blood-bowl/roster/163386',
      },
      what: 'TP roster 163386',
      item: { rosterId: 163386 },
      errors,
      session: undefined,
    });
    expect(parser.parse).toHaveBeenCalledWith(body);
    expect(errors).toEqual([]);
  });

  it('passes the given session on', async () => {
    const given = mock<TpFetchSession>();
    requestFetch.fetch.mockResolvedValue({ content: {} });
    parser.parse.mockReturnValue(ROSTER);

    await service.fetchRoster({ rosterId: 163386, errors, session: given });

    expect(requestFetch.fetch.mock.calls[0][0].session).toBe(given);
  });

  it('yields undefined without parsing when the fetch fails', async () => {
    requestFetch.fetch.mockResolvedValue(undefined);

    await expect(
      service.fetchRoster({ rosterId: 163386, errors }),
    ).resolves.toBeUndefined();
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('records one error and returns undefined when the response does not parse', async () => {
    requestFetch.fetch.mockResolvedValue({ content: {} });
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
    requestFetch.fetch.mockResolvedValue({ content: {} });
    parser.parse.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad shape';
    });

    await service.fetchRoster({ rosterId: 1, errors });

    expect(errors[0].message).toBe('Could not parse TP roster 1: bad shape');
  });

  it('lets a TP block stop the import', async () => {
    const blocked = new TpBlockedError(new Date('2026-09-29T12:05:00Z'));
    requestFetch.fetch.mockRejectedValue(blocked);

    await expect(
      service.fetchRoster({ rosterId: 163386, errors }),
    ).rejects.toBe(blocked);
    expect(parser.parse).not.toHaveBeenCalled();
  });
});
