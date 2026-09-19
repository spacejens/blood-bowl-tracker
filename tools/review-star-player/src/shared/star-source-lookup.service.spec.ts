import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblRawStarPlayerPageService } from '../source/bbl-raw-star-player-page.service';
import { TpRawStarPlayerIndexService } from '../source/tp-raw-star-player-index.service';
import { StarPlayerExternalIdsService } from './star-player-external-ids.service';
import { StarSourceLookupService } from './star-source-lookup.service';

const STAR = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

interface Deps {
  externalIds: MockProxy<StarPlayerExternalIdsService>;
  bbl: MockProxy<BblRawStarPlayerPageService>;
  tp: MockProxy<TpRawStarPlayerIndexService>;
}

function deps(): Deps {
  const externalIds = mock<StarPlayerExternalIdsService>();
  externalIds.bblTypIdsFor.mockResolvedValue([]);
  externalIds.forPosition.mockResolvedValue({ bbl: [], tp: [], name: [] });
  const bbl = mock<BblRawStarPlayerPageService>();
  bbl.starFor.mockResolvedValue(null);
  bbl.starForName.mockResolvedValue(null);
  const tp = mock<TpRawStarPlayerIndexService>();
  tp.starFor.mockResolvedValue(null);
  return { externalIds, bbl, tp };
}

async function makeService(overrides: Deps): Promise<StarSourceLookupService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarSourceLookupService,
      {
        provide: StarPlayerExternalIdsService,
        useValue: overrides.externalIds,
      },
      { provide: BblRawStarPlayerPageService, useValue: overrides.bbl },
      { provide: TpRawStarPlayerIndexService, useValue: overrides.tp },
    ],
  }).compile();
  return moduleRef.get(StarSourceLookupService);
}

const BBL_STAR = {
  typId: '126',
  name: 'Eldril Sidewinder',
  cost: '230 000 gp',
  canPlayFor: 'Any team with Elven Kingdoms League',
  skills: 'Catch, Dodge',
  skillRefs: [],
  characteristics: null,
};

const TP_STAR = {
  name: 'Eldril Sidewinder',
  entries: [],
};

describe('StarSourceLookupService', () => {
  describe('bblStarFor', () => {
    it('finds the page by typID', async () => {
      const d = deps();
      d.externalIds.bblTypIdsFor.mockResolvedValue(['126']);
      d.bbl.starFor.mockResolvedValue(BBL_STAR);
      const service = await makeService(d);

      const lookup = await service.bblStarFor(STAR);

      expect(lookup.star).toEqual(BBL_STAR);
      expect(d.bbl.starFor).toHaveBeenCalledWith('126');
    });

    it('falls back to a name lookup when the star carries no BBL typID', async () => {
      const d = deps();
      d.bbl.starForName.mockResolvedValue(BBL_STAR);
      const service = await makeService(d);

      const lookup = await service.bblStarFor(STAR);

      expect(lookup.star).toEqual(BBL_STAR);
      expect(d.bbl.starForName).toHaveBeenCalledWith('Eldril Sidewinder');
    });

    it('carries a not-found note naming the typIDs tried when nothing is found', async () => {
      const d = deps();
      d.externalIds.bblTypIdsFor.mockResolvedValue(['126', '127']);
      const service = await makeService(d);

      const lookup = await service.bblStarFor(STAR);

      expect(lookup.star).toBeNull();
      expect(lookup.notFoundNote).toContain('126, 127');
    });

    it('carries a not-found note explaining no typID was recorded', async () => {
      const service = await makeService(deps());

      const lookup = await service.bblStarFor(STAR);

      expect(lookup.star).toBeNull();
      expect(lookup.notFoundNote).toContain('no BBL typID recorded');
    });
  });

  describe('tpStarsFor', () => {
    it('looks up every TP spelling the star carries, deduplicated by name', async () => {
      const d = deps();
      d.externalIds.forPosition.mockResolvedValue({
        bbl: [],
        tp: ['Eldril Sidewinder'],
        name: [],
      });
      d.tp.starFor.mockResolvedValue(TP_STAR);
      const service = await makeService(d);

      const lookup = await service.tpStarsFor(STAR);

      expect(lookup.stars).toEqual([TP_STAR]);
    });

    it('dedupes two spellings that resolve to the same star name', async () => {
      const d = deps();
      d.externalIds.forPosition.mockResolvedValue({
        bbl: [],
        tp: ['Eldril Sidewinder', 'Eldril the Sidewinder'],
        name: [],
      });
      d.tp.starFor.mockImplementation((spelling) =>
        Promise.resolve(spelling.startsWith('Eldril') ? TP_STAR : null),
      );
      const service = await makeService(d);

      const lookup = await service.tpStarsFor(STAR);

      expect(lookup.stars).toEqual([TP_STAR]);
      expect(d.tp.starFor).toHaveBeenCalledTimes(2);
    });

    it('carries a not-found note naming the spellings tried when nothing is found', async () => {
      const d = deps();
      d.externalIds.forPosition.mockResolvedValue({
        bbl: [],
        tp: ['Some Spelling'],
        name: [],
      });
      const service = await makeService(d);

      const lookup = await service.tpStarsFor(STAR);

      expect(lookup.stars).toEqual([]);
      expect(lookup.notFoundNote).toContain('Some Spelling');
      expect(lookup.notFoundNote).toContain('Eldril Sidewinder');
    });
  });
});
