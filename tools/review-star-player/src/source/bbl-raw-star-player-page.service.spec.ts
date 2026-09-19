import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import { BblMirrorReaderService } from './bbl-mirror-reader.service';
import { BblRawStarPlayerPageService } from './bbl-raw-star-player-page.service';
import { BblSkillEntryService } from './bbl-skill-entry.service';

function starPage(name: string): string {
  return `<html><body>
<h1>${name}</h1>
<table><tr><td>${name}</td><td>inducement price: 230&nbsp;000 gp</td></tr></table>
<table><tr><td>Star Player</td></tr>
<tr><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th></tr>
<tr><td>8</td><td>3</td><td>2+</td><td>5+</td><td>8+</td><td>Loner(4+), Catch, Dodge</td></tr>
</table>
<table class="tblist"><tr class="trlisthead"><th><b>Can play for:</b></th></tr>
<tr><td class="small"><span class='opaque70'>Any team with </span>Elven&nbsp;Kingdoms&nbsp;League&nbsp;</td></tr></table>
<table><tr><th colspan="2">Improvements categories</th></tr>
<tr><td>primary:<br>secondary:</td><td>None (star player)</td></tr></table>
</body></html>`;
}

const REGULAR_PAGE = `<html><body><h1>Dwarf Blitzer</h1>
<table><tr><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th></tr>
<tr><td>5</td><td>3</td><td>3+</td><td>4+</td><td>9+</td><td>Block</td></tr></table>
<table><tr><td>primary:</td><td>General, Strength</td></tr></table>
</body></html>`;

async function makeService(
  reader: MockProxy<BblMirrorReaderService>,
): Promise<BblRawStarPlayerPageService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblRawStarPlayerPageService,
      { provide: BblMirrorReaderService, useValue: reader },
      StarPlayerNameMatcherService,
      BblSkillEntryService,
    ],
  }).compile();
  return moduleRef.get(BblRawStarPlayerPageService);
}

describe('BblRawStarPlayerPageService', () => {
  it('parses a star page addressed by typID', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.readPage.mockResolvedValue(starPage('Eldril Sidewinder'));
    const service = await makeService(reader);

    expect(await service.starFor('126')).toEqual({
      typId: '126',
      name: 'Eldril Sidewinder',
      cost: '230 000 gp',
      canPlayFor: 'Any team with Elven Kingdoms League',
      skills: 'Loner(4+), Catch, Dodge',
      skillRefs: [
        { name: 'Loner', attributeValue: '4+' },
        { name: 'Catch', attributeValue: null },
        { name: 'Dodge', attributeValue: null },
      ],
      characteristics: {
        move: '8',
        strength: '3',
        agility: '2+',
        passing: '5+',
        armour: '8+',
      },
    });
  });

  it('returns null for a page that is not a star player', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.readPage.mockResolvedValue(REGULAR_PAGE);
    const service = await makeService(reader);

    expect(await service.starFor('7')).toBeNull();
  });

  it('returns null for a typID that is not in the mirror', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.readPage.mockResolvedValue(null);
    const service = await makeService(reader);

    expect(await service.starFor('999')).toBeNull();
  });

  it('rejects a non-numeric typID without touching the mirror', async () => {
    const reader = mock<BblMirrorReaderService>();
    const service = await makeService(reader);

    expect(await service.starFor('../etc')).toBeNull();
    expect(reader.readPage).not.toHaveBeenCalled();
  });

  it('caches a parsed page', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.readPage.mockResolvedValue(starPage('Eldril Sidewinder'));
    const service = await makeService(reader);

    await service.starFor('126');
    await service.starFor('126');

    expect(reader.readPage).toHaveBeenCalledTimes(1);
  });

  it('finds a star by name through the mirror sweep', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.listPositionPageFilenames.mockResolvedValue([
      'default.asp?p=pt&typID=7',
      'default.asp?p=pt&typID=126',
    ]);
    reader.readPage.mockImplementation((filename) =>
      Promise.resolve(
        filename.endsWith('126') ? starPage('Eldril Sidewinder') : REGULAR_PAGE,
      ),
    );
    const service = await makeService(reader);

    const star = await service.starForName('Eldril Sidewinder');

    expect(star?.typId).toBe('126');
  });

  it('sweeps the mirror only once across name lookups', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.listPositionPageFilenames.mockResolvedValue([
      'default.asp?p=pt&typID=126',
    ]);
    reader.readPage.mockResolvedValue(starPage('Eldril Sidewinder'));
    const service = await makeService(reader);

    await service.starForName('Eldril Sidewinder');
    await service.starForName('Nobody At All');

    expect(reader.listPositionPageFilenames).toHaveBeenCalledTimes(1);
  });

  it('falls back to a normalized name match when the exact spelling differs', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.listPositionPageFilenames.mockResolvedValue([
      'default.asp?p=pt&typID=126',
    ]);
    reader.readPage.mockResolvedValue(starPage('Dolfar Longstride (& Grak)'));
    const service = await makeService(reader);

    const star = await service.starForName('Dolfar Longstride');

    expect(star?.typId).toBe('126');
  });

  it('returns null for a name no star page carries', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.listPositionPageFilenames.mockResolvedValue([]);
    const service = await makeService(reader);

    expect(await service.starForName('Nobody At All')).toBeNull();
  });

  it('renders a page with no readable characteristics table as null characteristics', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.readPage.mockResolvedValue(
      '<html><body><h1>Mystery Star</h1><table><tr><td>None (star player)</td></tr></table></body></html>',
    );
    const service = await makeService(reader);

    const star = await service.starFor('55');

    expect(star).toEqual({
      typId: '55',
      name: 'Mystery Star',
      cost: null,
      canPlayFor: null,
      skills: null,
      skillRefs: [],
      characteristics: null,
    });
  });

  it('renders null characteristics and skills when the data row is short a cell', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.readPage.mockResolvedValue(
      `<html><body><h1>Short Row Star</h1>
<table><tr><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th></tr>
<tr><td>8</td><td>3</td><td>2+</td></tr></table>
<table><tr><td>None (star player)</td></tr></table>
</body></html>`,
    );
    const service = await makeService(reader);

    const star = await service.starFor('56');

    expect(star?.characteristics).toBeNull();
    expect(star?.skills).toBeNull();
  });

  it('renders null characteristics when a characteristic cell is unreadable', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.readPage.mockResolvedValue(
      `<html><body><h1>Bad Value Star</h1>
<table><tr><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th></tr>
<tr><td>8</td><td>3</td><td>N/A</td><td>5+</td><td>8+</td><td>Dodge</td></tr></table>
<table><tr><td>None (star player)</td></tr></table>
</body></html>`,
    );
    const service = await makeService(reader);

    const star = await service.starFor('57');

    expect(star?.characteristics).toBeNull();
    expect(star?.skills).toBeNull();
  });

  it('parses the skills cell into refs alongside the verbatim text', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.readPage.mockResolvedValue(
      '<h1>Grombrindal</h1><table>' +
        '<tr><td>None (star player)</td></tr>' +
        '<tr><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th></tr>' +
        '<tr><td>5</td><td>4</td><td>4</td><td>5</td><td>9</td>' +
        '<td>Block, Loner (4+)</td></tr>' +
        '</table>',
    );
    const service = await makeService(reader);

    const star = await service.starFor('900');

    expect(star?.skillRefs).toEqual([
      { name: 'Block', attributeValue: null },
      { name: 'Loner', attributeValue: '4+' },
    ]);
  });

  it('reports no skill refs when the page has no skills cell', async () => {
    const reader = mock<BblMirrorReaderService>();
    reader.readPage.mockResolvedValue(
      '<h1>Grombrindal</h1><table>' +
        '<tr><td>None (star player)</td></tr>' +
        '<tr><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th></tr>' +
        '<tr><td>5</td><td>4</td><td>4</td><td>5</td><td>9</td></tr>' +
        '</table>',
    );
    const service = await makeService(reader);

    const star = await service.starFor('900');

    expect(star?.skillRefs).toEqual([]);
  });
});
