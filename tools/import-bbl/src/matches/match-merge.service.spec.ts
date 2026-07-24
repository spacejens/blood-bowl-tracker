import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import type { BblMatch } from './match-list-page-parser';
import { MatchMergeService } from './match-merge.service';
import type { MatchMergePair } from './match-merge-config.service';
import { MatchMergeConfigService } from './match-merge-config.service';

async function makeService(
  merges: MatchMergePair[],
  matchesByCompetitionId: Record<string, BblMatch[]>,
): Promise<MatchMergeService> {
  const reader = mock<BblMatchListReaderService>();
  reader.getMatchesByCompetitionId.mockResolvedValue(
    new Map(Object.entries(matchesByCompetitionId)),
  );
  const mergeConfig = mock<MatchMergeConfigService>();
  mergeConfig.getMerges.mockReturnValue(merges);
  const importResults = mock<ImportResultService>();
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));

  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchMergeService,
      { provide: BblMatchListReaderService, useValue: reader },
      { provide: MatchMergeConfigService, useValue: mergeConfig },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();
  return moduleRef.get(MatchMergeService);
}

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('MatchMergeService', () => {
  it('resolves a pair whose ids share a competition, picking the lower id as primary', async () => {
    const service = await makeService(
      [{ firstMatchId: '1062', secondMatchId: '1061' }],
      {
        '32': [
          { bblId: '1061', date: d('2016-09-25') },
          { bblId: '1062', date: d('2016-09-24') },
        ],
      },
    );
    const errors: ImportError[] = [];
    const merges = await service.resolve(errors);

    expect(errors).toHaveLength(0);
    expect(merges.isPrimary('1061')).toBe(true);
    expect(merges.isSecondary('1061')).toBe(false);
    expect(merges.isPrimary('1062')).toBe(false);
    expect(merges.isSecondary('1062')).toBe(true);
    expect(merges.partnerBblId('1061')).toBe('1062');
    expect(merges.partnerBblId('1062')).toBe('1061');
    expect(merges.primaryBblIdByBblId.get('1062')).toBe('1061');
  });

  it('resolves the canonical playedAt to the earliest of the pair for both members', async () => {
    const service = await makeService(
      [{ firstMatchId: '1061', secondMatchId: '1062' }],
      {
        '32': [
          { bblId: '1061', date: d('2016-09-25') },
          { bblId: '1062', date: d('2016-09-24') },
        ],
      },
    );
    const merges = await service.resolve([]);

    expect(merges.effectivePlayedAt('1061', d('2016-09-25'))).toEqual(
      d('2016-09-24'),
    );
    expect(merges.effectivePlayedAt('1062', d('2016-09-24'))).toEqual(
      d('2016-09-24'),
    );
  });

  it('passes an unpaired match date through unchanged', async () => {
    const service = await makeService(
      [{ firstMatchId: '1061', secondMatchId: '1062' }],
      {
        '32': [
          { bblId: '1061', date: d('2016-09-25') },
          { bblId: '1062', date: d('2016-09-24') },
        ],
      },
    );
    const merges = await service.resolve([]);

    expect(merges.isPrimary('999')).toBe(false);
    expect(merges.isSecondary('999')).toBe(false);
    expect(merges.partnerBblId('999')).toBeUndefined();
    expect(merges.effectivePlayedAt('999', d('2020-01-01'))).toEqual(
      d('2020-01-01'),
    );
  });

  it('does not merge a pair whose ids are in different competitions, and records one error', async () => {
    const service = await makeService(
      [{ firstMatchId: '1061', secondMatchId: '1062' }],
      {
        '32': [{ bblId: '1061', date: d('2016-09-25') }],
        '40': [{ bblId: '1062', date: d('2017-10-08') }],
      },
    );
    const errors: ImportError[] = [];
    const merges = await service.resolve(errors);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('1061');
    expect(errors[0].message).toContain('1062');
    expect(merges.isPrimary('1061')).toBe(false);
    expect(merges.isSecondary('1061')).toBe(false);
    expect(merges.partnerBblId('1061')).toBeUndefined();
    expect(merges.effectivePlayedAt('1061', d('2016-09-25'))).toEqual(
      d('2016-09-25'),
    );
  });

  it('records an error when one id of a pair is missing from every match list', async () => {
    const service = await makeService(
      [{ firstMatchId: '1061', secondMatchId: '1062' }],
      {
        '32': [{ bblId: '1061', date: d('2016-09-25') }],
      },
    );
    const errors: ImportError[] = [];
    await service.resolve(errors);
    expect(errors).toHaveLength(1);
  });

  it('memoizes the resolution, only recording pair errors once', async () => {
    const service = await makeService(
      [{ firstMatchId: '1061', secondMatchId: '1062' }],
      {
        '32': [{ bblId: '1061', date: d('2016-09-25') }],
      },
    );
    const first: ImportError[] = [];
    await service.resolve(first);
    const second: ImportError[] = [];
    await service.resolve(second);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });
});
