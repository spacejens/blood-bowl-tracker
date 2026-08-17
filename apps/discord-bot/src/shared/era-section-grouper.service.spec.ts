import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { EraSectionGrouperService } from './era-section-grouper.service';

type Row = { eraId: number; eraName: string; label: string };

const bb2016a: Row = { eraId: 10, eraName: 'BB2016', label: 'a' };
const bb2016b: Row = { eraId: 10, eraName: 'BB2016', label: 'b' };
const bb2020a: Row = { eraId: 20, eraName: 'BB2020', label: 'c' };
const bb2020b: Row = { eraId: 20, eraName: 'BB2020', label: 'd' };

describe('EraSectionGrouperService', () => {
  let service: EraSectionGrouperService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [EraSectionGrouperService],
    }).compile();
    service = moduleRef.get(EraSectionGrouperService);
  });

  describe('group', () => {
    it('returns no sections for an empty row list', () => {
      expect(service.group([])).toEqual([]);
    });

    it('puts every row of one era into a single section named after it', () => {
      expect(service.group([bb2016a, bb2016b])).toEqual([
        { eraName: 'BB2016', rows: [bb2016a, bb2016b] },
      ]);
    });

    it('opens a new section at each era change, preserving input order', () => {
      expect(service.group([bb2020a, bb2020b, bb2016a])).toEqual([
        { eraName: 'BB2020', rows: [bb2020a, bb2020b] },
        { eraName: 'BB2016', rows: [bb2016a] },
      ]);
    });

    it('groups only consecutive rows: non-adjacent rows of one era stay in separate sections', () => {
      // Documents the deliberate contract: this groups by adjacent key, it
      // does not sort or re-bucket. Both call sites feed it an already
      // era-ordered list, so this input cannot occur there.
      expect(service.group([bb2016a, bb2020a, bb2016b])).toEqual([
        { eraName: 'BB2016', rows: [bb2016a] },
        { eraName: 'BB2020', rows: [bb2020a] },
        { eraName: 'BB2016', rows: [bb2016b] },
      ]);
    });

    it('does not mutate the input array', () => {
      const rows = [bb2016a, bb2020a];

      service.group(rows);

      expect(rows).toEqual([bb2016a, bb2020a]);
    });
  });
});
