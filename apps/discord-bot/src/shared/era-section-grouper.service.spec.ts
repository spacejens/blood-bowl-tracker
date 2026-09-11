import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { DateRangeFormatterService } from './date-range-formatter.service';
import { EraSectionGrouperService } from './era-section-grouper.service';

type Row = {
  eraId: number;
  eraName: string;
  eraStartDate: string;
  eraEndDate: string | null;
  label: string;
};

const BB2016 = {
  eraId: 10,
  eraName: 'BB2016',
  eraStartDate: '2016-01-01',
  eraEndDate: '2019-12-31',
};
const BB2020 = {
  eraId: 20,
  eraName: 'BB2020',
  eraStartDate: '2020-01-01',
  eraEndDate: null,
};

const bb2016a: Row = { ...BB2016, label: 'a' };
const bb2016b: Row = { ...BB2016, label: 'b' };
const bb2020a: Row = { ...BB2020, label: 'c' };
const bb2020b: Row = { ...BB2020, label: 'd' };

describe('EraSectionGrouperService', () => {
  let service: EraSectionGrouperService;

  // DateRangeFormatterService is passed real, not mocked: it is a pure,
  // dependency-free formatting service and this suite asserts on the exact
  // heading text, which a mock would leave unasserted. See CLAUDE.md,
  // "Testing services".
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [EraSectionGrouperService, DateRangeFormatterService],
    }).compile();
    service = moduleRef.get(EraSectionGrouperService);
  });

  describe('group', () => {
    it('returns no sections for an empty row list', () => {
      expect(service.group([])).toEqual([]);
    });

    it("heads a closed era's section with its name and full date range", () => {
      expect(service.group([bb2016a, bb2016b])).toEqual([
        {
          eraName: 'BB2016',
          eraHeading: 'BB2016 (2016-01-01 – 2019-12-31)',
          rows: [bb2016a, bb2016b],
        },
      ]);
    });

    it("marks an ongoing era's section as still running", () => {
      expect(service.group([bb2020a])).toEqual([
        {
          eraName: 'BB2020',
          eraHeading: 'BB2020 (2020-01-01 – present)',
          rows: [bb2020a],
        },
      ]);
    });

    it('opens a new section at each era change, preserving input order', () => {
      expect(service.group([bb2020a, bb2020b, bb2016a])).toEqual([
        {
          eraName: 'BB2020',
          eraHeading: 'BB2020 (2020-01-01 – present)',
          rows: [bb2020a, bb2020b],
        },
        {
          eraName: 'BB2016',
          eraHeading: 'BB2016 (2016-01-01 – 2019-12-31)',
          rows: [bb2016a],
        },
      ]);
    });

    it('groups only consecutive rows: non-adjacent rows of one era stay in separate sections', () => {
      // Documents the deliberate contract: this groups by adjacent key, it
      // does not sort or re-bucket. Every call site feeds it an already
      // era-ordered list, so this input cannot occur there.
      expect(service.group([bb2016a, bb2020a, bb2016b])).toEqual([
        {
          eraName: 'BB2016',
          eraHeading: 'BB2016 (2016-01-01 – 2019-12-31)',
          rows: [bb2016a],
        },
        {
          eraName: 'BB2020',
          eraHeading: 'BB2020 (2020-01-01 – present)',
          rows: [bb2020a],
        },
        {
          eraName: 'BB2016',
          eraHeading: 'BB2016 (2016-01-01 – 2019-12-31)',
          rows: [bb2016b],
        },
      ]);
    });

    it('does not mutate the input array', () => {
      const rows = [bb2016a, bb2020a];

      service.group(rows);

      expect(rows).toEqual([bb2016a, bb2020a]);
    });
  });
});
