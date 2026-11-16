import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { FeedOwnerFitService } from './feed-owner-fit.service';
import type { SplitReport } from './feed-split-search.service';
import { FeedSplitSearchService } from './feed-split-search.service';
import { report } from './fill-plan.test-helpers';
import type { FeedFit, FeedOwner } from './fill-plan.types';

const NAMES = [{ skillId: 200, skillName: 'Dodge', nameId: 'Dodge' }];

function owner(playerId: number): FeedOwner {
  return { playerId, sppTotal: 40, unspentSpp: 0, rulesSets: [], paid: [] };
}

function owners(...ids: number[]): Map<number, FeedOwner> {
  return new Map(ids.map((id) => [id, owner(id)]));
}

/** Report n (message id n), which any of the given players may own. */
function split(n: number, ...ownerIds: number[]): SplitReport {
  return { report: report({ messageId: String(n) }), owners: ownerIds };
}

describe('FeedSplitSearchService', () => {
  let service: FeedSplitSearchService;
  let fits: MockProxy<FeedOwnerFitService>;

  /** Canned verdicts by `<player id>:<message ids>`; anything else is invalid. */
  function verdicts(table: Record<string, FeedFit>): void {
    fits.fit.mockImplementation(
      ({ owner: who, reports }) =>
        table[
          `${who.playerId}:${reports.map((row) => row.messageId).join(',')}`
        ] ?? 'invalid',
    );
  }

  beforeEach(async () => {
    fits = mock<FeedOwnerFitService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FeedSplitSearchService,
        { provide: FeedOwnerFitService, useValue: fits },
      ],
    }).compile();
    service = moduleRef.get(FeedSplitSearchService);
  });

  it('gives each owner his reports from the one valid split of two twins', () => {
    verdicts({ '1:1,2,3': 'valid', '2:4,5': 'valid' });
    const reports = [1, 2, 3, 4, 5].map((n) => split(n, 1, 2));

    expect(
      service.search({ reports, owners: owners(1, 2), skillNames: NAMES }),
    ).toEqual(
      new Map([
        [1, reports.slice(0, 3).map((row) => row.report)],
        [2, reports.slice(3).map((row) => row.report)],
      ]),
    );
  });

  it('gives one owner the reports of two keys, in the order given', () => {
    verdicts({ '1:1,2,3': 'valid' });
    const reports = [split(1, 1), split(2, 1), split(3, 1)];

    expect(
      service.search({ reports, owners: owners(1), skillNames: NAMES }),
    ).toEqual(new Map([[1, reports.map((row) => row.report)]]));
  });

  it('checks an owner with the reports the split gives him, his data and the skill names', () => {
    verdicts({ '1:1': 'valid' });

    service.search({
      reports: [split(1, 1)],
      owners: owners(1),
      skillNames: NAMES,
    });

    expect(fits.fit).toHaveBeenCalledWith({
      owner: owner(1),
      reports: [report({ messageId: '1' })],
      skillNames: NAMES,
    });
  });

  it('treats an owner the split gives no report as valid, without checking him', () => {
    verdicts({ '1:1': 'valid' });

    expect(
      service.search({
        reports: [split(1, 1, 2)],
        owners: owners(1, 2),
        skillNames: NAMES,
      }),
    ).toEqual(new Map([[1, [report({ messageId: '1' })]]]));
    for (const [input] of fits.fit.mock.calls) {
      expect(input.reports.length).toBeGreaterThan(0);
    }
  });

  it('proves nothing when two splits are valid', () => {
    verdicts({ '1:1': 'valid', '2:1': 'valid' });

    expect(
      service.search({
        reports: [split(1, 1, 2)],
        owners: owners(1, 2),
        skillNames: NAMES,
      }),
    ).toBeUndefined();
  });

  it('proves nothing when no split is valid', () => {
    verdicts({});

    expect(
      service.search({
        reports: [split(1, 1, 2)],
        owners: owners(1, 2),
        skillNames: NAMES,
      }),
    ).toBeUndefined();
  });

  it('proves nothing when the only split not ruled out cannot be decided', () => {
    verdicts({ '1:1': 'unknown' });

    expect(
      service.search({
        reports: [split(1, 1, 2)],
        owners: owners(1, 2),
        skillNames: NAMES,
      }),
    ).toBeUndefined();
  });

  it('proves nothing when a split that cannot be decided sits beside a valid one', () => {
    verdicts({ '1:1': 'valid', '2:1': 'unknown' });

    expect(
      service.search({
        reports: [split(1, 1, 2)],
        owners: owners(1, 2),
        skillNames: NAMES,
      }),
    ).toBeUndefined();
  });

  it('proves nothing for more than eight reports, without checking any', () => {
    const reports = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => split(n, 1));

    expect(
      service.search({ reports, owners: owners(1), skillNames: NAMES }),
    ).toBeUndefined();
    expect(fits.fit).not.toHaveBeenCalled();
  });

  it('still searches exactly eight reports and four owners', () => {
    verdicts({ '1:1,2,3,4,5,6,7,8': 'valid' });
    const reports = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => split(n, 1));

    expect(
      service.search({
        reports,
        owners: owners(1, 2, 3, 4),
        skillNames: NAMES,
      }),
    ).toEqual(new Map([[1, reports.map((row) => row.report)]]));
  });

  it('proves nothing for more than four owners, without checking any', () => {
    expect(
      service.search({
        reports: [split(1, 1, 2, 3, 4, 5)],
        owners: owners(1, 2, 3, 4, 5),
        skillNames: NAMES,
      }),
    ).toBeUndefined();
    expect(fits.fit).not.toHaveBeenCalled();
  });

  it('checks an owner given the same reports by several splits only once', () => {
    verdicts({});

    // Player 1 gets report 1 alone in all four splits of reports 2 and 3.
    service.search({
      reports: [split(1, 1), split(2, 2, 3), split(3, 2, 3)],
      owners: owners(1, 2, 3),
      skillNames: NAMES,
    });

    const forPlayerOne = fits.fit.mock.calls.filter(
      ([input]) => input.owner.playerId === 1,
    );
    expect(forPlayerOne).toHaveLength(1);
  });

  it('throws when a report names an owner that is not among the owners', () => {
    expect(() =>
      service.search({
        reports: [split(1, 1, 3)],
        owners: owners(1, 2),
        skillNames: NAMES,
      }),
    ).toThrow('names owner 3');
    expect(fits.fit).not.toHaveBeenCalled();
  });

  it('gives an empty result for no reports', () => {
    expect(
      service.search({ reports: [], owners: owners(1), skillNames: NAMES }),
    ).toEqual(new Map());
  });

  it('stops at the second split that is not ruled out', () => {
    // Splits run [1,1], [2,1], [1,2], [2,2]; the second is already valid, and
    // the third would be the first to ask about player 2 with report 2.
    verdicts({
      '1:1,2': 'valid',
      '1:2': 'valid',
      '2:1': 'valid',
      '1:1': 'valid',
    });

    expect(
      service.search({
        reports: [split(1, 1, 2), split(2, 1, 2)],
        owners: owners(1, 2),
        skillNames: NAMES,
      }),
    ).toBeUndefined();
    const later = fits.fit.mock.calls.filter(
      ([input]) =>
        input.owner.playerId === 2 &&
        input.reports.map((row) => row.messageId).join(',') === '2',
    );
    expect(later).toHaveLength(0);
  });
});
