import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';
import type { ReviewStarPlayer } from '../shared/review.types';
import type { StarPlayerStratifier } from '../shared/star-player-stratifier';
import { STAR_PLAYER_STRATIFIERS } from '../shared/star-player-stratifier';
import { StarPlayerLookupService } from './star-player-lookup.service';
import { StarPlayerSamplerService } from './star-player-sampler.service';

function reviewStarPlayer(
  overrides: Partial<ReviewStarPlayer> = {},
): ReviewStarPlayer {
  return {
    positionId: 7,
    positionName: 'Griff Oberwald',
    ...overrides,
  };
}

async function makeService(options: {
  stratifier?: MockProxy<StarPlayerStratifier>;
  lookup?: MockProxy<StarPlayerLookupService>;
  config?: MockProxy<StarPlayerReviewConfigService>;
}): Promise<StarPlayerSamplerService> {
  const stratifier =
    options.stratifier ??
    (() => {
      const created = mock<StarPlayerStratifier>();
      created.listStrata.mockReturnValue([]);
      return created;
    })();
  const lookup = options.lookup ?? mock<StarPlayerLookupService>();
  const config = options.config ?? mock<StarPlayerReviewConfigService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerSamplerService,
      { provide: STAR_PLAYER_STRATIFIERS, useValue: [stratifier] },
      { provide: StarPlayerLookupService, useValue: lookup },
      { provide: StarPlayerReviewConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(StarPlayerSamplerService);
}

describe('StarPlayerSamplerService', () => {
  it('samples each stratum exactly once, using its first declared source', async () => {
    const stratifier = mock<StarPlayerStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl', 'tp'] },
    ]);
    stratifier.sampleStratum.mockResolvedValue([reviewStarPlayer()]);
    const config = mock<StarPlayerReviewConfigService>();
    config.getStarsPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { items: stars, gaps } = await service.sample();

    expect(stars.map((star) => star.positionId)).toEqual([7]);
    expect(stars[0].selectedFor).toEqual(['Random sample']);
    expect(gaps).toEqual([]);
    expect(stratifier.sampleStratum).toHaveBeenCalledTimes(1);
    expect(stratifier.sampleStratum).toHaveBeenCalledWith({
      source: 'bbl',
      stratumId: 'random',
      limit: 3,
    });
  });

  it('adds a second label when a star is picked by two different strata', async () => {
    const stratifier = mock<StarPlayerStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl'] },
      {
        id: 'eligibility-mismatch',
        label: 'Eligibility mismatch',
        sources: ['bbl'],
      },
    ]);
    stratifier.sampleStratum.mockResolvedValue([reviewStarPlayer()]);
    const config = mock<StarPlayerReviewConfigService>();
    config.getStarsPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { items: stars } = await service.sample();

    expect(stars).toHaveLength(1);
    expect(stars[0].selectedFor).toEqual([
      'Random sample',
      'Eligibility mismatch',
    ]);
  });

  it('records a gap for a stratum that produced nothing for a source', async () => {
    const stratifier = mock<StarPlayerStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl'] },
    ]);
    stratifier.sampleStratum.mockResolvedValue([]);
    const config = mock<StarPlayerReviewConfigService>();
    config.getStarsPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { gaps } = await service.sample();

    expect(gaps).toEqual([
      {
        source: 'bbl',
        reason: 'No star player found for stratum "Random sample"',
      },
    ]);
  });

  it('records one gap for a stratum declaring multiple sources, using its first', async () => {
    const stratifier = mock<StarPlayerStratifier>();
    stratifier.listStrata.mockReturnValue([
      {
        id: 'eligibility-mismatch',
        label: 'Eligibility mismatch',
        sources: ['bbl', 'tp', 'manual'],
      },
    ]);
    stratifier.sampleStratum.mockResolvedValue([]);
    const config = mock<StarPlayerReviewConfigService>();
    config.getStarsPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { gaps } = await service.sample();

    expect(stratifier.sampleStratum).toHaveBeenCalledTimes(1);
    expect(gaps).toEqual([
      {
        source: 'bbl',
        reason: 'No star player found for stratum "Eligibility mismatch"',
      },
    ]);
  });

  it('adds override star players with the reason "override"', async () => {
    const stratifier = mock<StarPlayerStratifier>();
    stratifier.listStrata.mockReturnValue([]);
    const lookup = mock<StarPlayerLookupService>();
    lookup.findByExternalIds.mockResolvedValue([reviewStarPlayer()]);
    const config = mock<StarPlayerReviewConfigService>();
    config.getStarsPerStratum.mockReturnValue(3);
    config.getOverrides.mockImplementation((source) =>
      source === 'bbl' ? ['126'] : [],
    );
    const service = await makeService({ stratifier, lookup, config });

    const { items: stars } = await service.sample();

    expect(stars[0].selectedFor).toEqual(['override']);
  });

  it('records a gap naming the source and requested ids when fewer overrides resolve than requested', async () => {
    const stratifier = mock<StarPlayerStratifier>();
    stratifier.listStrata.mockReturnValue([]);
    const lookup = mock<StarPlayerLookupService>();
    lookup.findByExternalIds.mockResolvedValue([]);
    const config = mock<StarPlayerReviewConfigService>();
    config.getStarsPerStratum.mockReturnValue(3);
    config.getOverrides.mockImplementation((source) =>
      source === 'tp' ? ['NoSuchStar'] : [],
    );
    const service = await makeService({ stratifier, lookup, config });

    const { gaps } = await service.sample();

    expect(gaps).toEqual([
      {
        source: 'tp',
        reason:
          'Only 0 of 1 override star player(s) were found in the database: NoSuchStar',
      },
    ]);
  });

  it('sorts the result by star name, then position id', async () => {
    const stratifier = mock<StarPlayerStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl'] },
    ]);
    stratifier.sampleStratum.mockResolvedValue([
      reviewStarPlayer({ positionId: 5, positionName: 'Beta' }),
      reviewStarPlayer({ positionId: 2, positionName: 'Beta' }),
      reviewStarPlayer({ positionId: 9, positionName: 'Alpha' }),
    ]);
    const config = mock<StarPlayerReviewConfigService>();
    config.getStarsPerStratum.mockReturnValue(3);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    const { items: stars } = await service.sample();

    expect(stars.map((star) => [star.positionName, star.positionId])).toEqual([
      ['Alpha', 9],
      ['Beta', 2],
      ['Beta', 5],
    ]);
  });

  it('passes getStarsPerStratum() through as each request limit', async () => {
    const stratifier = mock<StarPlayerStratifier>();
    stratifier.listStrata.mockReturnValue([
      { id: 'random', label: 'Random sample', sources: ['bbl'] },
    ]);
    stratifier.sampleStratum.mockResolvedValue([reviewStarPlayer()]);
    const config = mock<StarPlayerReviewConfigService>();
    config.getStarsPerStratum.mockReturnValue(7);
    config.getOverrides.mockReturnValue([]);
    const service = await makeService({ stratifier, config });

    await service.sample();

    expect(stratifier.sampleStratum).toHaveBeenCalledWith({
      source: 'bbl',
      stratumId: 'random',
      limit: 7,
    });
  });
});
