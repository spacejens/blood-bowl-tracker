import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblPlayerAdvancementsReaderService } from './bbl-player-advancements-reader.service';
import { BblPlayerSkillsCellService } from './bbl-player-skills-cell.service';
import { BblRawPlayerPageLoaderService } from './bbl-raw-player-page-loader.service';

function page(skillsCell: string): string {
  return (
    '<table>' +
    '<tr><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th></tr>' +
    `<tr><td>6</td><td>3</td><td>3</td><td>4</td><td>9</td><td>${skillsCell}</td></tr>` +
    '</table>'
  );
}

describe('BblPlayerAdvancementsReaderService', () => {
  let service: BblPlayerAdvancementsReaderService;
  let loader: MockProxy<BblRawPlayerPageLoaderService>;

  beforeEach(async () => {
    loader = mock<BblRawPlayerPageLoaderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblPlayerAdvancementsReaderService,
        BblPlayerSkillsCellService,
        { provide: BblRawPlayerPageLoaderService, useValue: loader },
      ],
    }).compile();
    service = moduleRef.get(BblPlayerAdvancementsReaderService);
  });

  it('returns the parsed advancements for a page the mirror has', async () => {
    loader.loadPlayerPage.mockResolvedValue(page('Block, Dodge'));

    expect(await service.read('1000')).toEqual({
      skills: [
        {
          name: 'Block',
          attributeValue: null,
          source: 'starting',
          advancementOrder: null,
        },
        {
          name: 'Dodge',
          attributeValue: null,
          source: 'starting',
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
    });
  });

  it('returns null when loadPlayerPage resolves to null', async () => {
    loader.loadPlayerPage.mockResolvedValue(null);

    expect(await service.read('1000')).toBeNull();
  });

  it('returns null when the page has no Skills cell', async () => {
    loader.loadPlayerPage.mockResolvedValue(
      '<table>' +
        '<tr><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th></tr>' +
        '<tr><td>6</td><td>3</td><td>3</td><td>4</td><td>9</td></tr>' +
        '</table>',
    );

    expect(await service.read('1000')).toBeNull();
  });

  it('caches the result, so a second read for the same id does not reload', async () => {
    loader.loadPlayerPage.mockResolvedValue(page('Block'));

    const first = await service.read('1000');
    const second = await service.read('1000');

    expect(second).toEqual(first);
    expect(loader.loadPlayerPage).toHaveBeenCalledTimes(1);
  });

  it('does not share the cache across different ids', async () => {
    loader.loadPlayerPage.mockResolvedValue(page('Block'));

    await service.read('1000');
    await service.read('2000');

    expect(loader.loadPlayerPage).toHaveBeenCalledTimes(2);
  });
});
