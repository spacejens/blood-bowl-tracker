import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblPlayerAdvancementsReaderService } from './bbl-player-advancements-reader.service';
import { BblPlayerSkillsCellService } from './bbl-player-skills-cell.service';
import { BblRawPlayerPageLoaderService } from './bbl-raw-player-page-loader.service';

const ADVANCEMENTS = {
  skills: [
    {
      name: 'Block',
      attributeValue: null,
      source: 'starting' as const,
      advancementOrder: null,
    },
  ],
  increaseCounts: {
    move: 0,
    strength: 0,
    agility: 0,
    passing: 0,
    armour: 0,
  },
};

describe('BblPlayerAdvancementsReaderService', () => {
  let service: BblPlayerAdvancementsReaderService;
  let loader: MockProxy<BblRawPlayerPageLoaderService>;
  let cell: MockProxy<BblPlayerSkillsCellService>;

  beforeEach(async () => {
    loader = mock<BblRawPlayerPageLoaderService>();
    cell = mock<BblPlayerSkillsCellService>();
    cell.parse.mockReturnValue(ADVANCEMENTS);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblPlayerAdvancementsReaderService,
        { provide: BblPlayerSkillsCellService, useValue: cell },
        { provide: BblRawPlayerPageLoaderService, useValue: loader },
      ],
    }).compile();
    service = moduleRef.get(BblPlayerAdvancementsReaderService);
  });

  it("returns the page parser's result for a page the mirror has", async () => {
    loader.loadPlayerPage.mockResolvedValue('<html>the page</html>');

    expect(await service.read('1000')).toEqual(ADVANCEMENTS);
    expect(cell.parse).toHaveBeenCalledWith('<html>the page</html>');
  });

  it('returns null when loadPlayerPage resolves to null, without parsing anything', async () => {
    loader.loadPlayerPage.mockResolvedValue(null);

    expect(await service.read('1000')).toBeNull();
    expect(cell.parse).not.toHaveBeenCalled();
  });

  it('returns null when the page parser finds no Skills cell', async () => {
    loader.loadPlayerPage.mockResolvedValue('<html>no skills cell</html>');
    cell.parse.mockReturnValue(null);

    expect(await service.read('1000')).toBeNull();
  });

  it('caches the result, so a second read for the same id does not reload', async () => {
    loader.loadPlayerPage.mockResolvedValue('<html>the page</html>');

    const first = await service.read('1000');
    const second = await service.read('1000');

    expect(second).toEqual(first);
    expect(loader.loadPlayerPage).toHaveBeenCalledTimes(1);
    expect(cell.parse).toHaveBeenCalledTimes(1);
  });

  it('does not share the cache across different ids', async () => {
    loader.loadPlayerPage.mockResolvedValue('<html>the page</html>');

    await service.read('1000');
    await service.read('2000');

    expect(loader.loadPlayerPage).toHaveBeenCalledTimes(2);
  });
});
