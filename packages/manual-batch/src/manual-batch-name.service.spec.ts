import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ManualBatchNameService } from './manual-batch-name.service';

describe('ManualBatchNameService', () => {
  let service: ManualBatchNameService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ManualBatchNameService],
    }).compile();
    service = moduleRef.get(ManualBatchNameService);
  });

  it('parses a batch name into its number and slug', () => {
    expect(service.parse('002-initial-cleanup')).toEqual({
      number: 2,
      slug: 'initial-cleanup',
    });
  });

  it.each(['2-x', '002-Bad', '002-', '002-a--b'])(
    'returns null for %s',
    (name) => {
      expect(service.parse(name)).toBeNull();
    },
  );

  it('formats a number and slug with a three-digit number', () => {
    expect(service.format(7, 'tp-low-spp-player-fills')).toBe(
      '007-tp-low-spp-player-fills',
    );
  });

  it('rejects a number that does not fit three digits', () => {
    expect(() => service.format(1000, 'x')).toThrow(
      'Batch number 1000 does not fit three digits',
    );
  });

  it('rejects a slug that is not lowercase hyphenated', () => {
    expect(() => service.format(3, 'Bad Slug')).toThrow(
      'Batch slug "Bad Slug" is not lowercase hyphenated',
    );
  });
});
