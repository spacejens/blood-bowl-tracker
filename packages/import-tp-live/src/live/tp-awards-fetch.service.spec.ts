import type {
  ImportError,
  TpCompetitionAward,
} from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import { AwardsParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpBlockedError } from '@blood-bowl-tracker/scrape-tp';
import type { TpBaseUrls } from '@blood-bowl-tracker/tp-paths';
import { TpTournamentPathsService } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpAwardsFetchService } from './tp-awards-fetch.service';
import { TpRequestFetchService } from './tp-request-fetch.service';

const API = 'https://tp.example/api/';
const AWARDS_PAGE = 'https://tp.example/blood-bowl/s30/awards';
const AWARDS: TpCompetitionAward[] = [
  { id: 24112, awardType: 1, rosterId: 179769 },
];

describe('TpAwardsFetchService', () => {
  let service: TpAwardsFetchService;
  let requestFetch: MockProxy<TpRequestFetchService>;
  let parser: MockProxy<AwardsParserService>;
  let errors: ImportError[];

  beforeEach(async () => {
    requestFetch = mock<TpRequestFetchService>();
    const baseUrls = mock<TpBaseUrls>();
    baseUrls.getBackendApiUrl.mockReturnValue(API);
    baseUrls.getFrontendBaseUrl.mockReturnValue(
      'https://tp.example/blood-bowl/',
    );
    requestFetch.baseUrls.mockReturnValue(baseUrls);
    requestFetch.fetch.mockResolvedValue({ content: { raw: true } });
    parser = mock<AwardsParserService>();
    parser.parse.mockReturnValue(AWARDS);
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpAwardsFetchService,
        { provide: TpRequestFetchService, useValue: requestFetch },
        TpTournamentPathsService,
        { provide: AwardsParserService, useValue: parser },
        ImportResultService,
        UpsertRecorderService,
      ],
    }).compile();
    service = moduleRef.get(TpAwardsFetchService);
  });

  it('requests and parses the awards with the awards page as referer', async () => {
    await expect(
      service.fetchAwards({ tournamentSlug: 's30', errors }),
    ).resolves.toEqual(AWARDS);
    expect(requestFetch.fetch).toHaveBeenCalledWith({
      request: {
        path: 'awards/s30/awards',
        url: `${API}awards/s30/awards`,
        referer: AWARDS_PAGE,
      },
      what: 'TP awards of tournament s30',
      item: { tournamentSlug: 's30', path: 'awards/s30/awards' },
      errors,
      session: undefined,
    });
    expect(parser.parse).toHaveBeenCalledWith({ raw: true });
    expect(errors).toEqual([]);
  });

  it('passes the given session on', async () => {
    const given = mock<TpFetchSession>();

    await service.fetchAwards({
      tournamentSlug: 's30',
      errors,
      session: given,
    });

    expect(requestFetch.fetch.mock.calls[0][0].session).toBe(given);
  });

  it('yields undefined without parsing when the request fails', async () => {
    requestFetch.fetch.mockResolvedValue(undefined);

    await expect(
      service.fetchAwards({ tournamentSlug: 's30', errors }),
    ).resolves.toBeUndefined();
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('records one error and yields undefined when the response does not parse', async () => {
    parser.parse.mockImplementation(() => {
      throw new Error('Invalid TP awards JSON: (root)');
    });

    await expect(
      service.fetchAwards({ tournamentSlug: 's30', errors }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { tournamentSlug: 's30', path: 'awards/s30/awards' },
        message:
          'Could not parse TP awards of tournament s30: Invalid TP awards JSON: (root)',
      },
    ]);
  });

  it('lets a TP block stop the import', async () => {
    const blocked = new TpBlockedError(new Date('2026-09-29T12:05:00Z'));
    requestFetch.fetch.mockRejectedValue(blocked);

    await expect(
      service.fetchAwards({ tournamentSlug: 's30', errors }),
    ).rejects.toBe(blocked);
  });
});
