import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ReviewMatchConfigService } from '../config/review-match-config.service';
import type { MatchStratifier } from '../shared/match-stratifier';
import { MATCH_STRATIFIERS } from '../shared/match-stratifier';
import type { ReviewMatch, ReviewSource } from '../shared/review.types';
import { MatchLookupService } from './match-lookup.service';
import { MatchSamplerService } from './match-sampler.service';

function reviewMatch(
  source: ReviewSource,
  matchId: number,
  playedAt = '2021-09-25T18:00:00.000Z',
): ReviewMatch {
  return {
    source,
    matchId,
    externalId: String(1000 + matchId),
    matchName: `Round ${matchId}`,
    competitionName: 'Season 18',
    playedAt: new Date(playedAt),
    category: 'normal',
  };
}

interface Harness {
  service: MatchSamplerService;
  stratifier: MockProxy<MatchStratifier>;
  lookup: MockProxy<MatchLookupService>;
  config: MockProxy<ReviewMatchConfigService>;
}

async function makeHarness(): Promise<Harness> {
  const stratifier = mock<MatchStratifier>();
  stratifier.listStrata.mockReturnValue([
    { id: 'foul', label: 'Contains a foul', sources: ['bbl', 'tp'] },
    { id: 'avoided', label: 'Consequence avoided', sources: ['bbl'] },
  ]);
  stratifier.sampleStratum.mockResolvedValue([]);
  const lookup = mock<MatchLookupService>();
  lookup.findByExternalIds.mockResolvedValue([]);
  const config = mock<ReviewMatchConfigService>();
  config.getMatchesPerStratum.mockReturnValue(3);
  config.getOverrides.mockReturnValue([]);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchSamplerService,
      { provide: MATCH_STRATIFIERS, useValue: [stratifier] },
      { provide: MatchLookupService, useValue: lookup },
      { provide: ReviewMatchConfigService, useValue: config },
    ],
  }).compile();
  return {
    service: moduleRef.get(MatchSamplerService),
    stratifier,
    lookup,
    config,
  };
}

describe('MatchSamplerService', () => {
  it('samples every stratum for every source it applies to', async () => {
    const { service, stratifier } = await makeHarness();

    await service.sample();

    expect(stratifier.sampleStratum.mock.calls.map(([r]) => r)).toEqual([
      { source: 'bbl', stratumId: 'foul', limit: 3 },
      { source: 'tp', stratumId: 'foul', limit: 3 },
      { source: 'bbl', stratumId: 'avoided', limit: 3 },
    ]);
  });

  it('tags each sampled match with the stratum label it was picked for', async () => {
    const { service, stratifier } = await makeHarness();
    stratifier.sampleStratum.mockImplementation(({ source, stratumId }) =>
      Promise.resolve(
        source === 'bbl' && stratumId === 'foul' ? [reviewMatch('bbl', 1)] : [],
      ),
    );

    const { matches } = await service.sample();

    expect(matches).toEqual([
      { ...reviewMatch('bbl', 1), selectedFor: ['Contains a foul'] },
    ]);
  });

  it('reports a match picked by several strata once, listing every reason', async () => {
    const { service, stratifier } = await makeHarness();
    stratifier.sampleStratum.mockImplementation(({ source }) =>
      Promise.resolve(source === 'bbl' ? [reviewMatch('bbl', 1)] : []),
    );

    const { matches } = await service.sample();

    expect(matches).toHaveLength(1);
    expect(matches[0].selectedFor).toEqual([
      'Contains a foul',
      'Consequence avoided',
    ]);
  });

  it('backfills secondaryExternalId when a later stratum finds it for a match already selected', async () => {
    const { service, stratifier } = await makeHarness();
    stratifier.sampleStratum.mockImplementation(({ source, stratumId }) => {
      if (source !== 'bbl') {
        return Promise.resolve([]);
      }
      if (stratumId === 'foul') {
        return Promise.resolve([reviewMatch('bbl', 1)]);
      }
      if (stratumId === 'avoided') {
        return Promise.resolve([
          { ...reviewMatch('bbl', 1), secondaryExternalId: '2001' },
        ]);
      }
      return Promise.resolve([]);
    });

    const { matches } = await service.sample();

    expect(matches).toHaveLength(1);
    expect(matches[0].secondaryExternalId).toBe('2001');
  });

  it('records a gap for a stratum with no matching data instead of failing', async () => {
    const { service } = await makeHarness();

    const { gaps } = await service.sample();

    expect(gaps).toEqual([
      { source: 'bbl', reason: 'No match found for stratum "Contains a foul"' },
      { source: 'tp', reason: 'No match found for stratum "Contains a foul"' },
      {
        source: 'bbl',
        reason: 'No match found for stratum "Consequence avoided"',
      },
    ]);
  });

  it('always includes configured override matches', async () => {
    const { service, config, lookup } = await makeHarness();
    config.getOverrides.mockImplementation((source) =>
      source === 'tp' ? ['1042'] : [],
    );
    lookup.findByExternalIds.mockImplementation((source) =>
      Promise.resolve(source === 'tp' ? [reviewMatch('tp', 42)] : []),
    );

    const { matches } = await service.sample();

    expect(matches).toEqual([
      { ...reviewMatch('tp', 42), selectedFor: ['override'] },
    ]);
  });

  it('adds "override" to a match the strata already picked', async () => {
    const { service, stratifier, config, lookup } = await makeHarness();
    stratifier.sampleStratum.mockImplementation(({ source, stratumId }) =>
      Promise.resolve(
        source === 'bbl' && stratumId === 'foul' ? [reviewMatch('bbl', 1)] : [],
      ),
    );
    config.getOverrides.mockImplementation((source) =>
      source === 'bbl' ? ['1001'] : [],
    );
    lookup.findByExternalIds.mockImplementation((source) =>
      Promise.resolve(source === 'bbl' ? [reviewMatch('bbl', 1)] : []),
    );

    const { matches } = await service.sample();

    expect(matches).toHaveLength(1);
    expect(matches[0].selectedFor).toEqual(['Contains a foul', 'override']);
  });

  it('records a gap for an override id that is not in the database', async () => {
    const { service, config } = await makeHarness();
    config.getOverrides.mockImplementation((source) =>
      source === 'bbl' ? ['9999'] : [],
    );

    const { gaps } = await service.sample();

    expect(gaps).toContainEqual({
      source: 'bbl',
      reason: 'Override match "9999" was not found in the database',
    });
  });

  it('does not duplicate a reason already recorded for a match', async () => {
    const { service, config, lookup } = await makeHarness();
    // Two distinct override ids that both resolve to the same DB match —
    // merge() must not record the 'override' reason twice for it.
    config.getOverrides.mockImplementation((source) =>
      source === 'bbl' ? ['1001', '1001-alias'] : [],
    );
    lookup.findByExternalIds.mockImplementation((source) =>
      Promise.resolve(
        source === 'bbl' ? [reviewMatch('bbl', 1), reviewMatch('bbl', 1)] : [],
      ),
    );

    const { matches } = await service.sample();

    expect(matches).toHaveLength(1);
    expect(matches[0].selectedFor).toEqual(['override']);
  });

  it('breaks a tie between same-source matches played on the same date by id', async () => {
    const { service, stratifier } = await makeHarness();
    stratifier.sampleStratum.mockImplementation(({ source, stratumId }) =>
      Promise.resolve(
        source === 'bbl' && stratumId === 'foul'
          ? [
              reviewMatch('bbl', 2, '2021-09-25T18:00:00.000Z'),
              reviewMatch('bbl', 1, '2021-09-25T18:00:00.000Z'),
            ]
          : [],
      ),
    );

    const { matches } = await service.sample();

    expect(matches.map((match) => match.matchId)).toEqual([1, 2]);
  });

  it('orders matches by source, then by play date, then by id', async () => {
    const { service, stratifier } = await makeHarness();
    stratifier.sampleStratum.mockImplementation(({ source, stratumId }) =>
      Promise.resolve(
        stratumId !== 'foul'
          ? []
          : source === 'bbl'
            ? [
                reviewMatch('bbl', 2, '2021-10-01T00:00:00.000Z'),
                reviewMatch('bbl', 1, '2021-09-01T00:00:00.000Z'),
              ]
            : [reviewMatch('tp', 3, '2020-01-01T00:00:00.000Z')],
      ),
    );

    const { matches } = await service.sample();

    expect(matches.map((match) => match.matchId)).toEqual([1, 2, 3]);
  });
});
